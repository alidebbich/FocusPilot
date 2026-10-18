import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../components/Toast';
import { AudioCaptureService } from '../services/audio/AudioCaptureService';
import { QuestionDetector } from '../services/audio/QuestionDetector';
import { ContextFusionService } from '../services/fusion/ContextFusionService';
import type {
  AudioDevice,
  AudioSessionStatus,
  TranscriptSegment,
  QuestionDetection,
} from '../services/audio/types';
import type {
  ChatMessage,
  ImageContext,
  ScreenSource,
  ScreenContextStatus,
} from '../../shared/types';

const QUICK_ACTIONS = [
  { label: '🔍 Explain Screen', prompt: 'Explain clearly what is visible on my screen right now, highlighting key elements and context.' },
  { label: '💻 Explain Code', prompt: 'Analyze the code visible on my screen. Explain what it does, how it works, and point out any potential improvements or bugs.' },
  { label: '⚠️ Understand Error', prompt: 'Help me understand the error message or issue visible on my screen. Explain what caused it and give step-by-step instructions to fix it.' },
  { label: '📝 Summarize Session', prompt: 'Summarize the discussion and visible content from this session into clear key takeaways and action items.' },
  { label: '💡 Suggest Answer', prompt: 'Analyze the question or problem visible on my screen or spoken in the meeting. Suggest an optimal answer and clearly explain the reasoning.' },
  { label: '⚡ Make Concise', prompt: 'Summarize your previous response into 3 concise, actionable bullet points.' },
];

const INTERVAL_OPTIONS = [
  { label: 'Manual Only', value: 0 },
  { label: 'Every 5s', value: 5 },
  { label: 'Every 15s', value: 15 },
  { label: 'Every 30s', value: 30 },
  { label: 'Every 60s', value: 60 },
];

// Singleton instances for persistent audio & fusion lifecycle across renders
const audioService = new AudioCaptureService();
const questionDetector = new QuestionDetector();
const fusionService = new ContextFusionService();

export default function FloatingAssistant({
  onStatusUpdate,
}: {
  onStatusUpdate?: (screenActive: boolean, audioStatus: AudioSessionStatus, volume: number) => void;
}) {
  const { settings, hasApiKey } = useSettings();
  const { showToast } = useToast();

  // ─── Screen Context State ─────────────────────────────────────
  const [screenContextEnabled, setScreenContextEnabled] = useState(false);
  const [contextStatus, setContextStatus] = useState<ScreenContextStatus>('off');
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [currentFrame, setCurrentFrame] = useState<ImageContext | null>(null);
  const [intervalSeconds, setIntervalSeconds] = useState<number>(settings.captureIntervalSeconds || 15);
  const [showSourcesDropdown, setShowSourcesDropdown] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  // ─── Live Audio Understanding State ──────────────────────────
  const [audioStatus, setAudioStatus] = useState<AudioSessionStatus>('idle');
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [activeMicLabel, setActiveMicLabel] = useState<string>('Default Microphone');
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState<string>('');
  const [detectedQuestion, setDetectedQuestion] = useState<QuestionDetection | null>(null);
  const [autoAnswer, setAutoAnswer] = useState<boolean>(settings.autoAnswerQuestions ?? true);
  const [showAudioOptions, setShowAudioOptions] = useState(false);
  const [showTranscriptPanel, setShowTranscriptPanel] = useState(true);

  // ─── Conversation / Chat State ───────────────────────────────
  const [conversationId, setConversationId] = useState<string>(() => uuidv4());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Notify parent header of status updates
  useEffect(() => {
    onStatusUpdate?.(screenContextEnabled, audioStatus, volumeLevel);
  }, [screenContextEnabled, audioStatus, volumeLevel, onStatusUpdate]);

  // Scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptSegments, interimText]);

  // Initial source and audio device loading
  useEffect(() => {
    loadSources();
    loadAudioDevices();
  }, []);

  // ─── Audio Service Event Listeners ───────────────────────────
  useEffect(() => {
    const unsubTranscript = audioService.onTranscript((seg) => {
      if (seg.isFinal) {
        setTranscriptSegments((prev) => [...prev, seg]);
        setInterimText('');
        // Feed into Question Detector
        questionDetector.processSegment(seg);
      } else {
        setInterimText(seg.text);
        questionDetector.processSegment(seg);
      }
    });

    const unsubStatus = audioService.onStatusChange((status) => {
      setAudioStatus(status);
    });

    const unsubError = audioService.onError((err) => {
      showToast('error', err);
    });

    const unsubVolume = audioService.onVolumeLevel((vol) => {
      setVolumeLevel(vol);
    });

    const unsubQuestion = questionDetector.onQuestion((q) => {
      setDetectedQuestion(q);
      showToast('info', `Detected question: "${q.text.substring(0, 40)}…"`);

      // If auto-answer is enabled and not already generating, trigger response immediately!
      if (autoAnswer && !isGenerating && hasApiKey) {
        handleTriggerAnswer(q.text);
      }
    });

    return () => {
      unsubTranscript();
      unsubStatus();
      unsubError();
      unsubVolume();
      unsubQuestion();
    };
  }, [autoAnswer, isGenerating, hasApiKey, showToast]);

  // ─── AI Streaming Event Listeners ────────────────────────────
  useEffect(() => {
    const unsubChunk = window.api.ai.onStreamChunk((chunk) => {
      setStreamingText((prev) => prev + chunk);
    });

    const unsubEnd = window.api.ai.onStreamEnd(() => {
      setStreamingText((finalText) => {
        if (finalText) {
          const assistantMsg: ChatMessage = {
            id: uuidv4(),
            role: 'assistant',
            content: finalText,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
        return '';
      });
      setIsGenerating(false);
      setContextStatus(screenContextEnabled ? 'ready' : 'off');
    });

    const unsubError = window.api.ai.onStreamError((err) => {
      showToast('error', err);
      setIsGenerating(false);
      setContextStatus('error');
    });

    return () => {
      unsubChunk();
      unsubEnd();
      unsubError();
    };
  }, [screenContextEnabled, showToast]);

  // ─── Continuous Screen Capture Interval ───────────────────────
  useEffect(() => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }

    if (screenContextEnabled && intervalSeconds > 0) {
      captureTimerRef.current = setInterval(() => {
        if (!isGenerating) {
          performCapture(false);
        }
      }, intervalSeconds * 1000);
    }

    return () => {
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    };
  }, [screenContextEnabled, intervalSeconds, selectedSourceId, isGenerating]);

  async function loadSources() {
    try {
      const srcs = await window.api.screen.getSources();
      setSources(srcs);
      if (srcs.length > 0 && !selectedSourceId) {
        setSelectedSourceId(srcs[0].id);
      }
    } catch (err) {
      console.error('Failed to get sources:', err);
    }
  }

  async function loadAudioDevices() {
    const devices = await audioService.getDevices();
    setAudioDevices(devices);
    if (devices.length > 0 && !selectedMicId) {
      setSelectedMicId(devices[0].deviceId);
    }
  }

  async function performCapture(force = true): Promise<ImageContext | null> {
    try {
      setContextStatus('capturing');
      setScreenError(null);

      const res = await window.api.screen.captureFrame({
        sourceId: selectedSourceId || undefined,
        force,
      });

      if (!res.ok || !res.base64 || !res.dataUrl) {
        setScreenError(res.error || 'Failed to capture frame');
        setContextStatus('error');
        return null;
      }

      const frame: ImageContext = {
        base64: res.base64,
        dataUrl: res.dataUrl,
        mimeType: res.mimeType || 'image/jpeg',
        width: res.width || 1280,
        height: res.height || 720,
        timestamp: res.timestamp || Date.now(),
        sourceId: res.sourceId,
        sourceName: res.sourceName,
        hash: res.hash,
      };

      setCurrentFrame(frame);
      setContextStatus('ready');
      return frame;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setScreenError(msg);
      setContextStatus('error');
      return null;
    }
  }

  const toggleScreenContext = async () => {
    const nextState = !screenContextEnabled;
    setScreenContextEnabled(nextState);

    if (nextState) {
      setContextStatus('capturing');
      await performCapture(true);
      showToast('info', 'Screen context enabled');
    } else {
      setContextStatus('off');
      showToast('info', 'Screen context paused');
    }
  };

  const handleManualCapture = async () => {
    if (!screenContextEnabled) {
      setScreenContextEnabled(true);
    }
    const frame = await performCapture(true);
    if (frame) {
      showToast('success', 'Screen captured');
    }
  };

  // ─── Live Audio Control Handlers ─────────────────────────────
  const toggleAudioListening = async () => {
    if (audioStatus === 'listening') {
      await audioService.stopListening();
      questionDetector.clear();
      showToast('info', 'Audio listening stopped (Microphone disconnected)');
    } else if (audioStatus === 'paused') {
      audioService.resumeListening();
      showToast('info', 'Audio listening resumed');
    } else {
      try {
        const { deviceLabel } = await audioService.startListening({
          deviceId: selectedMicId || undefined,
        });
        setActiveMicLabel(deviceLabel);
        showToast('success', `Listening on: ${deviceLabel}`);
      } catch (err) {
        // Error already handled by callback
      }
    }
  };

  const handlePauseAudio = () => {
    if (audioStatus === 'listening') {
      audioService.pauseListening();
      showToast('info', 'Audio listening paused');
    } else if (audioStatus === 'paused') {
      audioService.resumeListening();
      showToast('info', 'Audio listening resumed');
    }
  };

  const handleClearTranscript = () => {
    setTranscriptSegments([]);
    setInterimText('');
    setDetectedQuestion(null);
    questionDetector.clear();
    showToast('info', 'Transcript cleared');
  };

  // ─── Send / Context Fusion Handler ───────────────────────────
  const handleTriggerAnswer = async (questionText?: string) => {
    const prompt = (questionText || input).trim();
    if (!prompt || isGenerating) return;

    if (!hasApiKey) {
      showToast('warning', 'Please enter your API key in Settings first.');
      return;
    }

    let activeImageContext = currentFrame;
    if (screenContextEnabled && !activeImageContext) {
      activeImageContext = await performCapture(true);
    }

    // Cancel any previous in-progress generation
    fusionService.cancelActiveRequest();

    // Prepare fused payload
    const payload = fusionService.prepareFusedPayload({
      conversationId,
      question: prompt,
      imageContext: activeImageContext,
      transcriptSegments,
      previousMessages: messages,
      provider: settings.provider,
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
    });

    setMessages(payload.messages);
    setInput('');
    setStreamingText('');
    setIsGenerating(true);
    setDetectedQuestion(null);
    setContextStatus(activeImageContext ? 'analyzing' : 'ready');

    try {
      await window.api.ai.sendMessage(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', msg);
      setIsGenerating(false);
      setContextStatus('error');
    }
  };

  const handleStop = () => {
    fusionService.cancelActiveRequest();
    setIsGenerating(false);
    setContextStatus(screenContextEnabled ? 'ready' : 'off');
    showToast('info', 'Generation stopped');
  };

  const handleClearChat = () => {
    setMessages([]);
    setStreamingText('');
    setConversationId(uuidv4());
    showToast('info', 'Conversation cleared');
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    showToast('success', 'Copied to clipboard');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTriggerAnswer();
    }
  };

  const isAudioActive = audioStatus === 'listening';
  const isAudioPaused = audioStatus === 'paused';

  return (
    <div className="flex flex-col h-full bg-charcoal-950/90 text-gray-100 overflow-hidden select-none">
      {/* ─── DUAL CONTEXT CONTROL BAR ────────────────────────── */}
      <div className="px-3 py-2 bg-charcoal-900/95 border-b border-charcoal-800/80 backdrop-blur-md flex flex-col gap-2">
        {/* Row 1: Screen Context Controls */}
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleScreenContext}
              className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                screenContextEnabled ? 'bg-emerald-600' : 'bg-charcoal-700'
              }`}
              title="Toggle Screen Context"
            >
              <span
                className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  screenContextEnabled ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="font-medium text-gray-200 text-[11px]">Screen Context</span>
            {screenContextEnabled && currentFrame && (
              <span
                onClick={() => setShowFullPreview(true)}
                className="text-[10px] text-gray-400 hover:text-violet-300 bg-charcoal-800 px-1.5 py-0.5 rounded cursor-pointer border border-charcoal-700"
                title="Click to view full screen preview"
              >
                📷 {currentFrame.width}x{currentFrame.height}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleManualCapture}
              disabled={isGenerating}
              className="px-2 py-0.5 text-[11px] font-medium bg-charcoal-800 hover:bg-charcoal-700 active:scale-95 text-emerald-400 border border-charcoal-700 hover:border-emerald-600/50 rounded cursor-pointer transition-all"
              title="Capture current frame"
            >
              📸 Capture
            </button>

            <button
              onClick={() => {
                loadSources();
                setShowSourcesDropdown(!showSourcesDropdown);
              }}
              className="px-1.5 py-0.5 text-[11px] bg-charcoal-800/80 hover:bg-charcoal-700 text-gray-300 border border-charcoal-700 rounded cursor-pointer"
              title="Screen capture target options"
            >
              ⚙
            </button>
          </div>
        </div>

        {/* Screen Target Dropdown */}
        {showSourcesDropdown && (
          <div className="bg-charcoal-850 border border-charcoal-700 rounded-lg p-2.5 text-xs flex flex-col gap-2 animate-fade-in shadow-xl">
            <div>
              <div className="font-semibold text-gray-300 text-[11px] mb-1">Target Window / Screen</div>
              <select
                value={selectedSourceId}
                onChange={(e) => {
                  setSelectedSourceId(e.target.value);
                  if (screenContextEnabled) performCapture(true);
                }}
                className="w-full bg-charcoal-900 border border-charcoal-600 rounded p-1 text-gray-200 text-xs focus:outline-none"
              >
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name.length > 30 ? s.name.substring(0, 30) + '…' : s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Capture Interval:</span>
              <div className="flex gap-1">
                {INTERVAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setIntervalSeconds(opt.value);
                      setShowSourcesDropdown(false);
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                      intervalSeconds === opt.value
                        ? 'bg-violet-600 text-white font-medium'
                        : 'bg-charcoal-800 text-gray-300 hover:bg-charcoal-700'
                    }`}
                  >
                    {opt.label.replace('Every ', '')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Row 2: Live Audio Understanding Controls */}
        <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-charcoal-800/60">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAudioListening}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer shadow-sm ${
                isAudioActive
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : isAudioPaused
                  ? 'bg-amber-600 hover:bg-amber-500 text-white'
                  : 'bg-violet-600 hover:bg-violet-500 text-white'
              }`}
              title={isAudioActive ? 'Stop live audio listening' : 'Start live audio listening'}
            >
              <span>{isAudioActive ? '⏹ Stop' : isAudioPaused ? '▶ Resume' : '🎙️ Listen'}</span>
            </button>

            {isAudioActive && (
              <button
                onClick={handlePauseAudio}
                className="px-2 py-1 bg-charcoal-800 hover:bg-charcoal-700 text-gray-300 text-[10px] rounded border border-charcoal-700 cursor-pointer"
                title="Pause speech capture"
              >
                ⏸ Pause
              </button>
            )}

            {/* Audio volume visualizer */}
            {isAudioActive && (
              <div className="flex items-center gap-1">
                <div className="w-12 h-2 bg-charcoal-800 rounded-full overflow-hidden border border-charcoal-700">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-violet-500 transition-all duration-75"
                    style={{ width: `${volumeLevel}%` }}
                  />
                </div>
                <span className="text-[9px] text-gray-400 font-mono">{volumeLevel}%</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {transcriptSegments.length > 0 && (
              <button
                onClick={() => setShowTranscriptPanel(!showTranscriptPanel)}
                className="text-[10px] text-violet-400 hover:text-violet-300 cursor-pointer"
              >
                {showTranscriptPanel ? 'Hide Transcript' : `Transcript (${transcriptSegments.length})`}
              </button>
            )}

            <button
              onClick={() => {
                loadAudioDevices();
                setShowAudioOptions(!showAudioOptions);
              }}
              className="px-1.5 py-0.5 text-[11px] bg-charcoal-800/80 hover:bg-charcoal-700 text-gray-300 border border-charcoal-700 rounded cursor-pointer"
              title="Microphone source disclosure & options"
            >
              ⚙
            </button>
          </div>
        </div>

        {/* Audio Device & Disclosure Dropdown */}
        {showAudioOptions && (
          <div className="bg-charcoal-850 border border-charcoal-700 rounded-lg p-2.5 text-xs flex flex-col gap-2 animate-fade-in shadow-xl">
            <div>
              <div className="font-semibold text-gray-300 text-[11px] mb-1">Microphone Input Device</div>
              <select
                value={selectedMicId}
                onChange={(e) => setSelectedMicId(e.target.value)}
                disabled={isAudioActive}
                className="w-full bg-charcoal-900 border border-charcoal-600 rounded p-1 text-gray-200 text-xs focus:outline-none"
              >
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-[10px] text-gray-400 bg-charcoal-900 p-2 rounded border border-charcoal-700/60 leading-relaxed">
              <strong>Source Disclosure:</strong> Captures audio from the selected microphone input. For system loopback meetings, select your headset or stereo mix device. Audio is streamed to the built-in speech recognition adapter and never stored raw on disk.
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <label className="flex items-center gap-2 cursor-pointer text-gray-300">
                <input
                  type="checkbox"
                  checked={autoAnswer}
                  onChange={(e) => setAutoAnswer(e.target.checked)}
                  className="rounded border-charcoal-600 text-violet-600 focus:ring-0"
                />
                <span>Auto-suggest answer when question is detected</span>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* ─── LIVE TRANSCRIPTION STREAM PANEL ─────────────────── */}
      {showTranscriptPanel && (transcriptSegments.length > 0 || interimText) && (
        <div className="max-h-28 overflow-y-auto px-3 py-2 bg-charcoal-900/60 border-b border-charcoal-800/60 text-[11px] leading-relaxed flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-gray-500 pb-1 border-b border-charcoal-800/40">
            <span className="flex items-center gap-1 font-semibold uppercase tracking-wider text-violet-400">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              Live Speech Transcript
            </span>
            <button
              onClick={handleClearTranscript}
              className="text-gray-500 hover:text-gray-300 cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="space-y-1">
            {transcriptSegments.slice(-4).map((seg) => (
              <div key={seg.id} className="text-gray-300">
                <span className="text-[9px] text-gray-500 mr-1.5">
                  {new Date(seg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span>{seg.text}</span>
              </div>
            ))}
            {interimText && (
              <div className="text-violet-300/80 italic animate-pulse">
                <span className="text-[9px] text-violet-500 mr-1.5">now</span>
                <span>{interimText}…</span>
              </div>
            )}
          </div>
          <div ref={transcriptEndRef} />
        </div>
      )}

      {/* ─── DETECTED QUESTION ALERT BANNER ──────────────────── */}
      {detectedQuestion && (
        <div className="px-3 py-2 bg-gradient-to-r from-violet-950/90 to-blue-950/90 border-b border-violet-800/70 flex items-center justify-between gap-2 text-xs animate-slide-in">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 text-[10px] font-semibold text-violet-300 uppercase tracking-wide">
              <span>💡</span>
              <span>Question Detected</span>
            </div>
            <div className="text-gray-200 font-medium truncate text-xs mt-0.5">
              "{detectedQuestion.text}"
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => handleTriggerAnswer(detectedQuestion.text)}
              disabled={isGenerating}
              className="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded text-[11px] font-semibold shadow-sm cursor-pointer"
            >
              Answer
            </button>
            <button
              onClick={() => setDetectedQuestion(null)}
              className="text-gray-400 hover:text-gray-200 p-1 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ─── FULL PREVIEW MODAL ──────────────────────────────── */}
      {showFullPreview && currentFrame && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowFullPreview(false)}
        >
          <div
            className="bg-charcoal-900 border border-charcoal-700 rounded-xl p-4 max-w-lg w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-charcoal-800">
              <span className="font-semibold text-sm text-gray-200">
                Authorized Screen Context ({currentFrame.width}x{currentFrame.height})
              </span>
              <button
                onClick={() => setShowFullPreview(false)}
                className="text-gray-400 hover:text-white p-1 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="overflow-auto max-h-[60vh] rounded border border-charcoal-700">
              <img src={currentFrame.dataUrl} alt="Screen Preview" className="w-full h-auto object-contain" />
            </div>
            <div className="pt-2 mt-2 flex items-center justify-between text-xs text-gray-400">
              <span>Captured {Math.round((Date.now() - currentFrame.timestamp) / 1000)}s ago.</span>
              <button
                onClick={() => setShowFullPreview(false)}
                className="btn btn-secondary btn-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CONTEXT-AWARE CONVERSATION AREA ─────────────────── */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
        {messages.length === 0 && !streamingText ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/30 to-blue-500/20 border border-violet-500/30 flex items-center justify-center text-xl mb-2.5 shadow-md shadow-violet-900/20">
              ✦
            </div>
            <h3 className="text-xs font-semibold text-gray-200 mb-1">FocusPilot Live Context Assistant</h3>
            <p className="text-[11px] text-gray-400 max-w-xs mb-3 leading-relaxed">
              Combines live screen context + meeting speech audio. Ask any question or click a prompt below.
            </p>

            <div className="w-full grid grid-cols-2 gap-1.5 text-left">
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={i}
                  onClick={() => handleTriggerAnswer(action.prompt)}
                  disabled={isGenerating}
                  className="px-2.5 py-1.5 bg-charcoal-900/80 hover:bg-charcoal-800 border border-charcoal-800 hover:border-violet-600/40 rounded-lg transition-all cursor-pointer text-left group"
                >
                  <div className="text-[11px] font-medium text-gray-300 group-hover:text-violet-300 transition-colors">
                    {action.label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl p-3 text-xs leading-relaxed select-text shadow-md ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white rounded-br-none'
                    : 'bg-charcoal-900 border border-charcoal-800 text-gray-200 rounded-bl-none prose-dark'
                }`}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>

              {msg.role === 'assistant' && (
                <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-gray-500">
                  <button
                    onClick={() => handleCopy(msg.id, msg.content)}
                    className="hover:text-gray-300 transition-colors cursor-pointer"
                  >
                    {copiedId === msg.id ? '✓ Copied' : 'Copy'}
                  </button>
                  <span>•</span>
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>
          ))
        )}

        {streamingText && (
          <div className="flex flex-col items-start animate-fade-in">
            <div className="max-w-[92%] rounded-2xl rounded-bl-none p-3 text-xs leading-relaxed bg-charcoal-900 border border-violet-800/50 text-gray-200 prose-dark shadow-lg">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {streamingText}
              </ReactMarkdown>
              <span className="inline-block w-1.5 h-3 ml-1 bg-violet-400 animate-pulse" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── QUICK PROMPTS STRIP ─────────────────────────────── */}
      {messages.length > 0 && (
        <div className="px-3 py-1 flex gap-1.5 overflow-x-auto no-scrollbar border-t border-charcoal-800/40 bg-charcoal-900/40">
          {QUICK_ACTIONS.slice(0, 4).map((action, i) => (
            <button
              key={i}
              onClick={() => handleTriggerAnswer(action.prompt)}
              disabled={isGenerating}
              className="px-2 py-0.5 text-[10px] whitespace-nowrap bg-charcoal-800/80 hover:bg-charcoal-700 text-gray-300 hover:text-violet-200 border border-charcoal-700 rounded-full transition-all cursor-pointer"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* ─── COMPOSER BAR ───────────────────────────────────── */}
      <div className="p-2.5 bg-charcoal-900/95 border-t border-charcoal-800/80 backdrop-blur-md">
        {/* Attached Context Pills */}
        <div className="mb-1.5 flex items-center gap-1.5 flex-wrap text-[10px]">
          {currentFrame && screenContextEnabled && (
            <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded-full">
              <span>📷 Screen Attached</span>
              <button
                onClick={() => setCurrentFrame(null)}
                className="hover:text-emerald-200 ml-0.5"
              >
                ✕
              </button>
            </span>
          )}

          {transcriptSegments.length > 0 && (
            <span className="inline-flex items-center gap-1 bg-violet-950/80 text-violet-300 border border-violet-800/60 px-2 py-0.5 rounded-full">
              <span>🎙️ Transcript Attached ({transcriptSegments.length} turns)</span>
              <button
                onClick={handleClearTranscript}
                className="hover:text-violet-200 ml-0.5"
              >
                ✕
              </button>
            </span>
          )}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              screenContextEnabled && isAudioActive
                ? 'Ask with Screen + Audio context... (Enter to send)'
                : screenContextEnabled
                ? 'Ask about your screen... (Enter to send)'
                : isAudioActive
                ? 'Ask about meeting speech... (Enter to send)'
                : 'Ask FocusPilot anything... (Enter to send)'
            }
            rows={1}
            disabled={isGenerating}
            className="flex-1 max-h-24 min-h-[36px] p-2 bg-charcoal-800/90 border border-charcoal-700 focus:border-violet-500 rounded-xl text-xs text-gray-100 placeholder-gray-500 focus:outline-none resize-none transition-colors"
          />

          {isGenerating ? (
            <button
              onClick={handleStop}
              className="h-[36px] px-3 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-medium text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center shadow-md shadow-red-950/40"
              title="Stop generating"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => handleTriggerAnswer()}
              disabled={!input.trim()}
              className={`h-[36px] px-3 rounded-xl font-medium text-xs transition-all flex items-center justify-center ${
                input.trim()
                  ? 'bg-violet-600 hover:bg-violet-500 active:scale-95 text-white shadow-md shadow-violet-900/40 cursor-pointer'
                  : 'bg-charcoal-800 text-gray-500 cursor-not-allowed'
              }`}
              title="Send message (Enter)"
            >
              Send
            </button>
          )}

          {messages.length > 0 && !isGenerating && (
            <button
              onClick={handleClearChat}
              className="h-[36px] px-2 text-gray-400 hover:text-gray-200 hover:bg-charcoal-800 rounded-xl transition-colors text-xs cursor-pointer"
              title="Clear conversation"
            >
              🗑️
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
