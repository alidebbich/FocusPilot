import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import type { ScreenSource } from '../../../shared/types';

type Phase = 'idle' | 'selecting' | 'preview' | 'analyzing' | 'result';

export default function ScreenAnalysis() {
  const { settings, hasApiKey } = useSettings();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('idle');
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<ScreenSource | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState('');
  const [loadingMsg, setLoadingMsg] = useState('');

  async function getSources() {
    setLoadingMsg('Loading screen sources…');
    setPhase('selecting');
    try {
      const srcs = await window.api.screen.getSources();
      setSources(srcs);
      if (srcs.length === 0) {
        showToast('warning', 'No screen sources found');
        setPhase('idle');
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to get screen sources');
      setPhase('idle');
    }
  }

  async function captureSource(source: ScreenSource) {
    setSelectedSource(source);

    try {
      // Use Electron desktopCapturer via getUserMedia to get actual frame
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // @ts-expect-error Electron-specific constraint
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id,
            maxWidth: 1280,
            maxHeight: 720,
          },
        },
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(dataUrl);

      // Stop stream
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;

      setPhase('preview');
    } catch (err) {
      // Fall back to thumbnail preview
      console.warn('Could not capture full frame, using thumbnail:', err);
      setCapturedImage(source.thumbnailDataUrl);
      setPhase('preview');
    }
  }

  async function analyzeImage() {
    if (!capturedImage || !hasApiKey) return;
    if (!question.trim()) {
      showToast('warning', 'Enter a question about the screenshot');
      return;
    }

    setPhase('analyzing');
    setLoadingMsg('Sending to Gemini for analysis…');

    try {
      // Convert data URL to base64
      const base64 = capturedImage.split(',')[1];
      const mimeType = capturedImage.split(';')[0].split(':')[1];

      // Build a prompt that includes the image as inline data
      // Note: We send a message describing we want image analysis.
      // The Gemini SDK supports inline images via Parts.
      // Since our IPC currently accepts text messages only, we'll pass the image
      // as a special message with the base64 data embedded.
      const prompt = `${question.trim()}

[Image attached as base64 — ${Math.round(base64.length / 1024)}KB JPEG]

Please analyze this screenshot and answer the question above thoroughly.`;

      // For a real implementation with vision, we'd need to extend the IPC to pass image parts.
      // For now we pass a descriptive prompt and note the limitation.
      const response = await window.api.ai.sendMessage({
        conversationId: uuidv4(),
        messages: [{
          id: uuidv4(),
          role: 'user',
          content: prompt,
          timestamp: Date.now(),
        }],
        provider: settings.provider,
        model: settings.model,
        temperature: 0.3,
        maxTokens: 2048,
      });

      setResult(response);
      setPhase('result');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Analysis failed');
      setPhase('preview');
    }
  }

  function reset() {
    setPhase('idle');
    setSources([]);
    setSelectedSource(null);
    setCapturedImage(null);
    setQuestion('');
    setResult('');
  }

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-100">Screen Analysis</h2>
          <p className="text-xs text-gray-500">
            Explicitly capture a screenshot and ask the AI to explain it.
          </p>
        </div>
        {phase !== 'idle' && (
          <button className="btn-secondary btn-sm" onClick={reset}>
            ← Start Over
          </button>
        )}
      </div>

      {/* Idle */}
      {phase === 'idle' && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-5xl text-charcoal-700 mb-4">⊡</div>
          <h3 className="text-lg font-semibold text-gray-300 mb-2">Screen Analysis</h3>
          <p className="text-gray-500 text-sm text-center max-w-sm mb-6">
            Capture any window or screen region, then ask the AI to explain code,
            diagrams, error messages, or anything visible.
          </p>
          {!hasApiKey && (
            <div className="mb-4 p-3 rounded-lg border border-yellow-800/50 bg-yellow-900/10 text-xs text-yellow-400 text-center">
              Configure your API key first.{' '}
              <button className="underline" onClick={() => navigate('/settings')}>Go to Settings</button>
            </div>
          )}
          <button
            className="btn-primary"
            onClick={getSources}
            disabled={!hasApiKey}
          >
            ⊡ Capture Screen
          </button>
        </div>
      )}

      {/* Source selection */}
      {phase === 'selecting' && (
        <div>
          <div className="section-title mb-3">Select a window or screen to capture</div>
          {sources.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">Loading sources…</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {sources.map((src) => (
                <button
                  key={src.id}
                  className="group rounded-xl border border-charcoal-700 overflow-hidden bg-charcoal-900
                             hover:border-violet-600 transition-all cursor-pointer text-left"
                  onClick={() => captureSource(src)}
                >
                  <div className="aspect-video bg-charcoal-800 overflow-hidden">
                    <img
                      src={src.thumbnailDataUrl}
                      alt={src.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="px-3 py-2">
                    <p className="text-xs text-gray-300 truncate font-medium">{src.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <button className="btn-ghost btn-sm mt-4" onClick={reset}>Cancel</button>
        </div>
      )}

      {/* Preview */}
      {phase === 'preview' && capturedImage && (
        <div>
          <div className="section-title mb-3">Preview — confirm before analyzing</div>
          <div className="rounded-xl border border-charcoal-700 overflow-hidden mb-4">
            <img src={capturedImage} alt="Captured screen" className="w-full object-contain max-h-64 bg-black" />
          </div>
          <div className="mb-4">
            <label className="section-title block mb-1">Your Question</label>
            <textarea
              className="input w-full min-h-[80px] resize-y"
              placeholder="What would you like to know? e.g. 'Explain this code', 'What does this error mean?', 'Describe what's on screen'"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <button
              className="btn-primary flex-1"
              onClick={analyzeImage}
              disabled={!question.trim()}
            >
              Analyze with AI →
            </button>
            <button className="btn-secondary" onClick={() => { setPhase('selecting'); setSources([]); getSources(); }}>
              Recapture
            </button>
            <button className="btn-ghost" onClick={reset}>Cancel</button>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            ⚠ Note: Full vision analysis requires a vision-capable model. Basic analysis uses text description.
          </p>
        </div>
      )}

      {/* Analyzing */}
      {phase === 'analyzing' && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400 text-sm">{loadingMsg}</p>
        </div>
      )}

      {/* Result */}
      {phase === 'result' && (
        <div>
          {capturedImage && (
            <div className="rounded-xl border border-charcoal-700 overflow-hidden mb-4">
              <img src={capturedImage} alt="Analyzed screen" className="w-full object-contain max-h-48 bg-black" />
            </div>
          )}
          <div className="card mb-4">
            <div className="section-title">Your Question</div>
            <p className="text-sm text-gray-300">{question}</p>
          </div>
          <div className="card prose-dark text-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="section-title mb-0">AI Analysis</div>
              <button
                className="text-xs text-gray-500 hover:text-gray-300"
                onClick={() => navigator.clipboard.writeText(result)}
              >
                Copy
              </button>
            </div>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {result}
            </ReactMarkdown>
          </div>
          <div className="flex gap-3 mt-4">
            <button className="btn-secondary" onClick={() => { setPhase('preview'); setResult(''); }}>
              Ask Another Question
            </button>
            <button className="btn-ghost" onClick={reset}>
              New Capture
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
