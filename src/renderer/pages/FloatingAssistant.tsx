import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../components/Toast';
import type { ChatMessage, ImageContext, ScreenSource, ScreenContextStatus } from '../../shared/types';

const QUICK_ACTIONS = [
  { label: '🔍 Explain Screen', prompt: 'Explain clearly what is visible on my screen right now, highlighting key elements and context.' },
  { label: '💻 Explain Code', prompt: 'Analyze the code visible on my screen. Explain what it does, how it works, and point out any potential improvements or bugs.' },
  { label: '⚠️ Understand Error', prompt: 'Help me understand the error message or issue visible on my screen. Explain what caused it and give step-by-step instructions to fix it.' },
  { label: '📝 Summarize Page', prompt: 'Provide a concise summary of the document, article, or page currently visible on my screen with key bullet points.' },
  { label: '💡 Suggest Answer', prompt: 'Analyze the question or problem visible on my screen. Suggest an optimal answer and clearly explain the reasoning behind it.' },
  { label: '⚡ Make Concise', prompt: 'Summarize your previous answer into 3 punchy, actionable bullet points.' },
];

const INTERVAL_OPTIONS = [
  { label: 'Manual Only', value: 0 },
  { label: 'Every 5s', value: 5 },
  { label: 'Every 15s', value: 15 },
  { label: 'Every 30s', value: 30 },
  { label: 'Every 60s', value: 60 },
];

export default function FloatingAssistant() {
  const { settings, hasApiKey } = useSettings();
  const { showToast } = useToast();

  // Screen Context state
  const [screenContextEnabled, setScreenContextEnabled] = useState(false);
  const [contextStatus, setContextStatus] = useState<ScreenContextStatus>('off');
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [currentFrame, setCurrentFrame] = useState<ImageContext | null>(null);
  const [intervalSeconds, setIntervalSeconds] = useState<number>(settings.captureIntervalSeconds || 15);
  const [isFrameChanged, setIsFrameChanged] = useState<boolean>(false);
  const [showSourcesDropdown, setShowSourcesDropdown] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Chat conversation state
  const [conversationId, setConversationId] = useState<string>(() => uuidv4());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Load available screen sources on mount
  useEffect(() => {
    loadSources();
  }, []);

  // Listen to streaming chunks
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

  // Continuous capture interval effect
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

  async function performCapture(force = true): Promise<ImageContext | null> {
    try {
      setContextStatus('capturing');
      setErrorMessage(null);

      const res = await window.api.screen.captureFrame({
        sourceId: selectedSourceId || undefined,
        force,
      });

      if (!res.ok || !res.base64 || !res.dataUrl) {
        setErrorMessage(res.error || 'Failed to capture frame');
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
      setIsFrameChanged(Boolean(res.changed));
      setContextStatus('ready');
      return frame;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
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

  const handleManualAnalyze = async () => {
    if (!screenContextEnabled) {
      setScreenContextEnabled(true);
    }
    const frame = await performCapture(true);
    if (frame) {
      showToast('success', 'Current screen captured as context');
    }
  };

  const sendMessage = async (textToSend?: string) => {
    const prompt = (textToSend || input).trim();
    if (!prompt || isGenerating) return;

    if (!hasApiKey) {
      showToast('warning', 'Please configure your API key in Settings first.');
      return;
    }

    let activeImageContext = currentFrame;

    // If screen context is enabled but no frame yet, capture right now
    if (screenContextEnabled && !activeImageContext) {
      activeImageContext = await performCapture(true);
    }

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setStreamingText('');
    setIsGenerating(true);
    setContextStatus(activeImageContext ? 'analyzing' : 'ready');

    try {
      await window.api.ai.sendMessage({
        conversationId,
        messages: newMessages,
        provider: settings.provider,
        model: settings.model,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        imageContext: activeImageContext || undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', msg);
      setIsGenerating(false);
      setContextStatus('error');
    }
  };

  const handleStop = () => {
    window.api.ai.cancel();
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
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-charcoal-950/90 text-gray-100 overflow-hidden select-none">
      {/* ─── SCREEN CONTEXT CONTROL BAR ──────────────────────── */}
      <div className="px-3.5 py-2.5 bg-charcoal-900/95 border-b border-charcoal-800/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          {/* Toggle Switch */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleScreenContext}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                screenContextEnabled ? 'bg-violet-600' : 'bg-charcoal-700'
              }`}
              title="Toggle Screen Context"
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  screenContextEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-xs font-medium text-gray-200">Screen Context</span>
          </div>

          {/* Quick Analyze Button */}
          <button
            onClick={handleManualAnalyze}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-charcoal-800 hover:bg-charcoal-700 active:scale-95 text-violet-300 hover:text-violet-200 border border-charcoal-700 hover:border-violet-600/50 rounded-lg transition-all cursor-pointer shadow-sm"
            title="Take a fresh capture of current screen"
          >
            <span>📸</span>
            <span>Capture Now</span>
          </button>

          {/* Source Selector & Interval */}
          <div className="relative">
            <button
              onClick={() => {
                loadSources();
                setShowSourcesDropdown(!showSourcesDropdown);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[11px] bg-charcoal-800/80 hover:bg-charcoal-700 text-gray-300 border border-charcoal-700 rounded-lg cursor-pointer transition-colors"
              title="Configure capture source & interval"
            >
              <span>⚙ Options</span>
            </button>

            {showSourcesDropdown && (
              <div className="absolute right-0 top-7 w-64 bg-charcoal-900 border border-charcoal-700 rounded-xl shadow-2xl p-3 z-50 text-xs flex flex-col gap-3 animate-fade-in">
                <div>
                  <div className="font-semibold text-gray-200 mb-1.5">Capture Target</div>
                  <select
                    value={selectedSourceId}
                    onChange={(e) => {
                      setSelectedSourceId(e.target.value);
                      if (screenContextEnabled) performCapture(true);
                    }}
                    className="w-full bg-charcoal-800 border border-charcoal-600 rounded-lg p-1.5 text-gray-200 text-xs focus:outline-none focus:border-violet-500"
                  >
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name.length > 28 ? s.name.substring(0, 28) + '…' : s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="font-semibold text-gray-200 mb-1.5">Auto-Refresh Interval</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {INTERVAL_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setIntervalSeconds(opt.value);
                          setShowSourcesDropdown(false);
                        }}
                        className={`px-2 py-1 rounded text-left transition-colors cursor-pointer text-[11px] ${
                          intervalSeconds === opt.value
                            ? 'bg-violet-600 text-white font-medium'
                            : 'bg-charcoal-800 text-gray-300 hover:bg-charcoal-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status & Preview Pill */}
        {screenContextEnabled && (
          <div className="mt-2 pt-2 border-t border-charcoal-800/60 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-2">
              {currentFrame ? (
                <div
                  onClick={() => setShowFullPreview(true)}
                  className="flex items-center gap-1.5 bg-charcoal-800 hover:bg-charcoal-750 px-2 py-0.5 rounded-md cursor-pointer border border-charcoal-700/80 transition-all group"
                  title="Click to preview captured frame"
                >
                  <img
                    src={currentFrame.dataUrl}
                    alt="Screen frame"
                    className="w-5 h-3.5 object-cover rounded border border-charcoal-600"
                  />
                  <span className="text-gray-300 group-hover:text-violet-300">
                    {currentFrame.sourceName ? (currentFrame.sourceName.length > 18 ? currentFrame.sourceName.substring(0, 18) + '…' : currentFrame.sourceName) : 'Screen'}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {Math.round((Date.now() - currentFrame.timestamp) / 1000)}s ago
                  </span>
                </div>
              ) : (
                <span className="text-gray-400">Capturing display…</span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  contextStatus === 'capturing'
                    ? 'bg-amber-400 animate-pulse'
                    : contextStatus === 'analyzing'
                    ? 'bg-violet-400 animate-pulse'
                    : contextStatus === 'ready'
                    ? 'bg-emerald-400'
                    : 'bg-red-400'
                }`}
              />
              <span className="text-gray-400 capitalize">{contextStatus}</span>
              {currentFrame && (
                <button
                  onClick={() => setCurrentFrame(null)}
                  className="ml-1 text-gray-500 hover:text-gray-300"
                  title="Detach frame"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mt-1.5 text-[11px] text-red-400 bg-red-950/40 px-2 py-1 rounded border border-red-900/60">
            {errorMessage}
          </div>
        )}
      </div>

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
                Authorized Screen Preview ({currentFrame.width}x{currentFrame.height})
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
              <span>Only shared with AI when you ask a question.</span>
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

      {/* ─── CONVERSATION CHAT AREA ─────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
        {messages.length === 0 && !streamingText ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600/30 to-blue-500/20 border border-violet-500/30 flex items-center justify-center text-2xl mb-3 shadow-lg shadow-violet-900/20">
              ✦
            </div>
            <h3 className="text-sm font-semibold text-gray-200 mb-1">Contextual Desktop Assistant</h3>
            <p className="text-xs text-gray-400 max-w-xs mb-4">
              Toggle screen context above or ask any question. FocusPilot reasons about visible code, errors, UI, and documents in real time.
            </p>

            {/* Quick Action Buttons */}
            <div className="w-full grid grid-cols-2 gap-2 text-left">
              {QUICK_ACTIONS.map((action, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(action.prompt)}
                  disabled={isGenerating}
                  className="px-2.5 py-2 bg-charcoal-900/80 hover:bg-charcoal-800 border border-charcoal-800 hover:border-violet-600/40 rounded-xl transition-all cursor-pointer text-left group"
                >
                  <div className="text-xs font-medium text-gray-300 group-hover:text-violet-300 transition-colors">
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
                className={`max-w-[90%] rounded-2xl p-3 text-xs leading-relaxed select-text shadow-md ${
                  msg.role === 'user'
                    ? 'bg-violet-600 text-white rounded-br-none'
                    : 'bg-charcoal-900 border border-charcoal-800 text-gray-200 rounded-bl-none prose-dark'
                }`}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>

              {/* Message Footer / Copy */}
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

        {/* Live streaming chunk bubble */}
        {streamingText && (
          <div className="flex flex-col items-start animate-fade-in">
            <div className="max-w-[90%] rounded-2xl rounded-bl-none p-3 text-xs leading-relaxed bg-charcoal-900 border border-violet-800/50 text-gray-200 prose-dark shadow-lg">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {streamingText}
              </ReactMarkdown>
              <span className="inline-block w-1.5 h-3 ml-1 bg-violet-400 animate-pulse" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── QUICK ACTIONS HORIZONTAL BAR ───────────────────── */}
      {messages.length > 0 && (
        <div className="px-3 py-1.5 flex gap-1.5 overflow-x-auto no-scrollbar border-t border-charcoal-800/40 bg-charcoal-900/40">
          {QUICK_ACTIONS.slice(0, 4).map((action, i) => (
            <button
              key={i}
              onClick={() => sendMessage(action.prompt)}
              disabled={isGenerating}
              className="px-2.5 py-1 text-[11px] whitespace-nowrap bg-charcoal-800/80 hover:bg-charcoal-700 text-gray-300 hover:text-violet-200 border border-charcoal-700 rounded-full transition-all cursor-pointer"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* ─── COMPOSER BAR ───────────────────────────────────── */}
      <div className="p-3 bg-charcoal-900/95 border-t border-charcoal-800/80 backdrop-blur-md">
        {/* Attached context chip */}
        {currentFrame && screenContextEnabled && (
          <div className="mb-2 flex items-center justify-between bg-charcoal-800/80 px-2.5 py-1 rounded-lg border border-charcoal-700/60 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-violet-400 font-semibold">📷 Screen Context Attached</span>
              <span className="text-gray-400">({currentFrame.width}x{currentFrame.height})</span>
            </div>
            <button
              onClick={() => performCapture(true)}
              className="text-gray-400 hover:text-violet-300 transition-colors"
              title="Refresh capture"
            >
              🔄 Refresh
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              screenContextEnabled
                ? 'Ask anything about your screen... (Enter to send)'
                : 'Ask FocusPilot anything... (Enter to send)'
            }
            rows={1}
            disabled={isGenerating}
            className="flex-1 max-h-28 min-h-[38px] p-2.5 bg-charcoal-800/90 border border-charcoal-700 focus:border-violet-500 rounded-xl text-xs text-gray-100 placeholder-gray-500 focus:outline-none resize-none transition-colors"
          />

          {isGenerating ? (
            <button
              onClick={handleStop}
              className="h-[38px] px-3.5 bg-red-600 hover:bg-red-500 active:scale-95 text-white font-medium text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center shadow-lg shadow-red-950/40"
              title="Stop generating"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              className={`h-[38px] px-3.5 rounded-xl font-medium text-xs transition-all flex items-center justify-center ${
                input.trim()
                  ? 'bg-violet-600 hover:bg-violet-500 active:scale-95 text-white shadow-lg shadow-violet-900/40 cursor-pointer'
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
              className="h-[38px] px-2.5 text-gray-400 hover:text-gray-200 hover:bg-charcoal-800 rounded-xl transition-colors text-xs cursor-pointer"
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
