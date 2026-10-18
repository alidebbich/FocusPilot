import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';

type AnalysisMode = 'explain' | 'review' | 'optimize' | 'debug' | 'convert';

const MODES: { value: AnalysisMode; label: string; prompt: string }[] = [
  { value: 'explain', label: 'Explain Code', prompt: 'Explain what this code does in clear, plain language. Include what each part does.' },
  { value: 'review', label: 'Code Review', prompt: 'Review this code. Identify issues, anti-patterns, security concerns, and suggest improvements.' },
  { value: 'optimize', label: 'Optimize', prompt: 'Suggest performance and readability optimizations for this code.' },
  { value: 'debug', label: 'Debug Help', prompt: 'Help debug this code. Identify potential bugs or errors.' },
  { value: 'convert', label: 'Convert/Refactor', prompt: 'Refactor this code to be cleaner, more idiomatic, or suggest a different approach.' },
];

export default function CodingPractice() {
  const { settings, hasApiKey } = useSettings();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [context, setContext] = useState('');
  const [mode, setMode] = useState<AnalysisMode>('explain');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  async function analyzeCode() {
    if (!code.trim()) {
      showToast('warning', 'Paste some code first');
      return;
    }
    if (!hasApiKey) {
      showToast('error', 'No API key configured. Go to Settings.');
      navigate('/settings');
      return;
    }

    const selectedMode = MODES.find((m) => m.value === mode)!;
    const prompt = `${selectedMode.prompt}

${context.trim() ? `Context from user: ${context.trim()}\n` : ''}
Code:
\`\`\`
${code}
\`\`\`

Provide a thorough, structured response using markdown formatting.`;

    setLoading(true);
    setResult('');

    try {
      const response = await window.api.ai.sendMessage({
        conversationId: uuidv4(),
        messages: [{ id: uuidv4(), role: 'user', content: prompt, timestamp: Date.now() }],
        provider: settings.provider,
        model: settings.model,
        temperature: 0.3,
        maxTokens: 4096,
      });
      setResult(response);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  function clearAll() {
    setCode('');
    setContext('');
    setResult('');
  }

  return (
    <div className="flex h-full">
      {/* Left: Input */}
      <div className="flex flex-col w-1/2 border-r border-charcoal-800 p-5">
        <h2 className="text-base font-semibold text-gray-100 mb-1">Coding Practice</h2>
        <p className="text-xs text-gray-500 mb-4">
          Paste code to get explanations, reviews, or debugging help.
        </p>

        {/* Mode selector */}
        <div className="mb-4">
          <div className="section-title">Analysis Mode</div>
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer
                  ${mode === m.value
                    ? 'border-violet-600 bg-violet-600/20 text-violet-300'
                    : 'border-charcoal-600 bg-charcoal-900 text-gray-400 hover:border-charcoal-500 hover:text-gray-200'
                  }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Context */}
        <div className="mb-3">
          <label className="section-title block mb-1">Additional Context (optional)</label>
          <input
            className="input"
            placeholder="e.g. 'This is a React hook' or 'I'm getting TypeError: undefined'"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>

        {/* Code input */}
        <div className="flex-1 mb-4">
          <label className="section-title block mb-1">Code</label>
          <textarea
            className="input w-full h-full min-h-[200px] font-mono text-xs resize-none"
            placeholder="Paste your code here…"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            className="btn-primary flex-1"
            onClick={analyzeCode}
            disabled={loading || !code.trim() || !hasApiKey}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                Analyzing…
              </span>
            ) : (
              `${MODES.find((m) => m.value === mode)?.label} →`
            )}
          </button>
          {(code || result) && (
            <button className="btn-secondary" onClick={clearAll}>Clear</button>
          )}
        </div>

        {!hasApiKey && (
          <p className="text-xs text-yellow-500 mt-2 text-center">
            Configure API key in Settings to enable analysis
          </p>
        )}
      </div>

      {/* Right: Result */}
      <div className="flex-1 flex flex-col p-5 overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="section-title mb-0">Result</div>
          {result && (
            <button
              className="text-xs text-gray-500 hover:text-gray-300"
              onClick={() => navigator.clipboard.writeText(result)}
            >
              Copy result
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-500">Analyzing code…</p>
              </div>
            </div>
          ) : result ? (
            <div className="prose-dark text-sm animate-fade-in">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children }) {
                    const isBlock = !!className;
                    if (isBlock) {
                      return (
                        <div className="relative group/code my-2">
                          <pre className="bg-charcoal-900 border border-charcoal-700 rounded-lg p-3 overflow-x-auto">
                            <code className="font-mono text-xs text-gray-300">{children}</code>
                          </pre>
                          <button
                            className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100
                                       text-xs px-2 py-1 rounded bg-charcoal-700 text-gray-400 hover:text-gray-200"
                            onClick={() => navigator.clipboard.writeText(String(children))}
                          >Copy</button>
                        </div>
                      );
                    }
                    return <code className="font-mono text-violet-300 bg-charcoal-900 px-1 py-0.5 rounded text-xs">{children}</code>;
                  },
                  p({ children }) { return <p className="mb-3 leading-relaxed text-gray-300">{children}</p>; },
                  ul({ children }) { return <ul className="list-disc list-inside mb-3 space-y-1 text-gray-300">{children}</ul>; },
                  ol({ children }) { return <ol className="list-decimal list-inside mb-3 space-y-1 text-gray-300">{children}</ol>; },
                  h1({ children }) { return <h1 className="text-base font-bold mb-2 text-gray-100">{children}</h1>; },
                  h2({ children }) { return <h2 className="text-sm font-bold mb-2 text-gray-100 border-b border-charcoal-700 pb-1">{children}</h2>; },
                  h3({ children }) { return <h3 className="text-sm font-semibold mb-1 text-gray-200">{children}</h3>; },
                  strong({ children }) { return <strong className="font-semibold text-gray-100">{children}</strong>; },
                  blockquote({ children }) { return <blockquote className="border-l-2 border-violet-600 pl-3 text-gray-400 italic my-2">{children}</blockquote>; },
                }}
              >
                {result}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="text-3xl text-charcoal-700 mb-3">⟨⟩</div>
              <p className="text-gray-500 text-sm">Analysis will appear here</p>
              <p className="text-gray-600 text-xs mt-1">
                Paste code on the left and choose an analysis mode
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
