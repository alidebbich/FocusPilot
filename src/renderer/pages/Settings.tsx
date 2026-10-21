import React, { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../components/Toast';

// Keep in sync with VALID_MODELS in src/main/providers/geminiProvider.ts
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
];

export default function Settings() {
  const { settings, updateSettings, hasApiKey, refreshKeyStatus } = useSettings();
  const { showToast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [connResult, setConnResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [deletingData, setDeletingData] = useState(false);

  async function saveKey() {
    if (!apiKey.trim()) {
      showToast('warning', 'Enter an API key first');
      return;
    }
    try {
      await window.api.keys.set(settings.provider, apiKey.trim());
      await refreshKeyStatus();
      setApiKey('');
      setConnResult(null);
      showToast('success', 'API key saved securely');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save key');
    }
  }

  async function removeKey() {
    try {
      await window.api.keys.delete(settings.provider);
      await refreshKeyStatus();
      setConnResult(null);
      showToast('success', 'API key removed');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to remove key');
    }
  }

  async function testConnection() {
    setTestingConn(true);
    setConnResult(null);
    try {
      const result = await window.api.ai.testConnection(settings.provider, settings.model);
      setConnResult(result);
      if (result.ok) {
        showToast('success', 'Connection test passed!');
      } else {
        showToast('error', result.error ?? 'Connection test failed');
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setConnResult({ ok: false, error });
    } finally {
      setTestingConn(false);
    }
  }

  async function deleteAllData() {
    if (!confirm('This will permanently delete ALL conversations, notes, interviews, and transcripts. This cannot be undone.')) return;
    setDeletingData(true);
    try {
      await window.api.data.deleteAll();
      showToast('success', 'All data deleted successfully');
    } catch (err) {
      showToast('error', 'Failed to delete data');
    } finally {
      setDeletingData(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <h2 className="text-xl font-bold text-gray-100 mb-6">Settings</h2>

      {/* AI Provider */}
      <div className="card mb-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-4">AI Provider</h3>

        <div className="mb-4">
          <label className="section-title block mb-2">Provider</label>
          <div className="flex gap-3">
            {(['gemini'] as const).map((p) => (
              <button
                key={p}
                onClick={() => updateSettings({ provider: p })}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all cursor-pointer
                  ${settings.provider === p
                    ? 'border-violet-600 bg-violet-600/20 text-violet-300'
                    : 'border-charcoal-600 bg-charcoal-900 text-gray-400 hover:border-charcoal-500 hover:text-gray-200'
                  }`}
              >
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-charcoal-700 text-gray-600 text-sm cursor-not-allowed">
              OpenAI <span className="text-xs">(coming soon)</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg border border-charcoal-700 text-gray-600 text-sm cursor-not-allowed">
              Grok <span className="text-xs">(coming soon)</span>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <label className="section-title block mb-2">Model</label>
          <select
            className="input max-w-xs"
            value={settings.model}
            onChange={(e) => updateSettings({ model: e.target.value })}
          >
            {GEMINI_MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <p className="text-xs text-gray-600 mt-1">
            gemini-2.5-flash is recommended for speed. gemini-2.5-pro for complex reasoning tasks.
          </p>
        </div>

        <div className="mb-4">
          <label className="section-title block mb-2">Temperature ({settings.temperature})</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={settings.temperature}
            onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) })}
            className="w-full accent-violet-600"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>Precise (0)</span>
            <span>Creative (1)</span>
          </div>
        </div>

        <div className="mb-4">
          <label className="section-title block mb-2">Max Output Tokens</label>
          <select
            className="input max-w-xs"
            value={settings.maxTokens}
            onChange={(e) => updateSettings({ maxTokens: parseInt(e.target.value) })}
          >
            {[1024, 2048, 4096, 8192].map((v) => (
              <option key={v} value={v}>{v.toLocaleString()} tokens</option>
            ))}
          </select>
        </div>
      </div>

      {/* API Key Management */}
      <div className="card mb-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">API Key</h3>
        <p className="text-xs text-gray-500 mb-4">
          Keys are stored in your OS credential store (not in any config file or database).
          Get a free Gemini API key from{' '}
          <span className="text-violet-400 cursor-pointer underline">aistudio.google.com</span>.
        </p>

        <div className="flex items-center gap-2 mb-3">
          <div className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-green-400' : 'bg-gray-600'}`} />
          <span className="text-sm text-gray-400">
            {hasApiKey ? `API key configured for ${settings.provider}` : 'No API key configured'}
          </span>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <input
              className="input pr-10"
              type={showKey ? 'text' : 'password'}
              placeholder="Enter your API key…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveKey()}
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <button className="btn-primary btn-sm" onClick={saveKey}>Save Key</button>
        </div>

        <div className="flex gap-2">
          <button
            className="btn-secondary btn-sm"
            onClick={testConnection}
            disabled={testingConn || !hasApiKey}
          >
            {testingConn ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                Testing…
              </span>
            ) : 'Test Connection'}
          </button>
          {hasApiKey && (
            <button className="btn-ghost btn-sm text-red-400 hover:text-red-300" onClick={removeKey}>
              Remove Key
            </button>
          )}
        </div>

        {connResult && (
          <div className={`mt-3 p-3 rounded-lg border text-xs ${
            connResult.ok
              ? 'border-green-800 bg-green-900/10 text-green-300'
              : 'border-red-800 bg-red-900/10 text-red-300'
          }`}>
            {connResult.ok ? '✓ Connection successful — API is working' : `✕ ${connResult.error}`}
          </div>
        )}
      </div>

      {/* Floating Window & Screenshot Options */}
      <div className="card mb-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">Floating Window & Screenshot Options</h3>
        <p className="text-xs text-gray-500 mb-4">
          Configure window transparency, screenshot visibility, and desktop floating behavior.
        </p>

        {/* Exclude from Capture */}
        <div className="mb-4 pb-4 border-b border-charcoal-700/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-gray-200">
              Exclude from Screenshots & Screen Shares
            </span>
            <button
              onClick={async () => {
                const next = !settings.excludeFromCapture;
                await window.api.window.setContentProtection(next);
                updateSettings({ excludeFromCapture: next });
                showToast('info', next ? 'Content protection enabled' : 'Content protection disabled');
              }}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                settings.excludeFromCapture ? 'bg-violet-600' : 'bg-charcoal-700'
              }`}
              title="Toggle content protection for screenshots"
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  settings.excludeFromCapture ? 'translate-x-4.5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed mb-2">
            Hides the assistant window from screen capture tools using standard Windows Display Affinity (<code>WDA_EXCLUDEFROMCAPTURE</code>) on Windows 10/11 and <code>NSWindowSharingNone</code> on macOS.
          </p>
          <div className="p-2.5 rounded-lg bg-charcoal-900/80 border border-charcoal-800 text-[11px] text-gray-400 space-y-1">
            <div><strong className="text-gray-300">✓ Supported:</strong> Windows Snipping Tool (<code>Win+Shift+S</code>), Windows Game Bar, modern recording apps, and desktop screen-sharing.</div>
            <div><strong className="text-gray-300">ℹ GDI / Legacy:</strong> Standard Print Screen on older graphics drivers may render a black/transparent rectangle or omit the window depending on DWM settings.</div>
          </div>
        </div>

        {/* Window Opacity */}
        <div className="mb-4 pb-4 border-b border-charcoal-700/60">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-200">
              Window Opacity ({Math.round((settings.windowOpacity ?? 0.95) * 100)}%)
            </label>
            <div className="flex gap-1.5">
              {[0.7, 0.85, 0.95, 1.0].map((val) => (
                <button
                  key={val}
                  onClick={() => {
                    window.api.window.setOpacity(val);
                    updateSettings({ windowOpacity: val });
                  }}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                    Math.abs((settings.windowOpacity ?? 0.95) - val) < 0.02
                      ? 'bg-violet-600 text-white font-medium'
                      : 'bg-charcoal-800 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {Math.round(val * 100)}%
                </button>
              ))}
            </div>
          </div>
          <input
            type="range"
            min="0.4"
            max="1.0"
            step="0.05"
            value={settings.windowOpacity ?? 0.95}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              window.api.window.setOpacity(val);
              updateSettings({ windowOpacity: val });
            }}
            className="w-full accent-violet-600"
          />
          <div className="flex justify-between text-[11px] text-gray-500 mt-1">
            <span>Translucent (40%)</span>
            <span>Solid (100%)</span>
          </div>
        </div>

        {/* Always on Top */}
        <div className="mb-4 pb-4 border-b border-charcoal-700/60 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-200">Always on Top</div>
            <div className="text-xs text-gray-400">Keep the assistant floating above other active desktop windows.</div>
          </div>
          <button
            onClick={async () => {
              const next = !settings.alwaysOnTop;
              const res = await window.api.window.setAlwaysOnTop(next);
              updateSettings({ alwaysOnTop: res });
              showToast('info', res ? 'Always on top enabled' : 'Always on top disabled');
            }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
              settings.alwaysOnTop ? 'bg-violet-600' : 'bg-charcoal-700'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                settings.alwaysOnTop ? 'translate-x-4.5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Global Keyboard Shortcut */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-200">Show / Hide Shortcut</div>
            <div className="text-xs text-gray-400">Toggle floating window visibility from anywhere on your system.</div>
          </div>
          <div className="px-2.5 py-1 rounded bg-charcoal-900 border border-charcoal-700 font-mono text-xs text-violet-300">
            Ctrl + Shift + Space
          </div>
        </div>
      </div>

      {/* System Instructions */}
      <div className="card mb-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">System Instructions</h3>
        <p className="text-xs text-gray-500 mb-3">
          Optional instructions sent with every AI conversation to customize behavior.
        </p>
        <textarea
          className="input w-full min-h-[80px] resize-y font-mono text-xs"
          placeholder="e.g. 'Always explain code step by step.' or 'You are a senior React developer.'"
          value={settings.systemInstruction}
          onChange={(e) => updateSettings({ systemInstruction: e.target.value })}
        />
      </div>

      {/* Data management */}
      <div className="card border-red-900/30">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">Data Management</h3>
        <p className="text-xs text-gray-500 mb-4">
          All data is stored locally in an SQLite database on your machine.
          No data is sent to any server other than your configured AI provider.
        </p>
        <button
          className="btn-danger btn-sm"
          onClick={deleteAllData}
          disabled={deletingData}
        >
          {deletingData ? 'Deleting…' : 'Delete All Local Data'}
        </button>
        <p className="text-xs text-red-500 mt-2">
          This permanently deletes all conversations, notes, interviews, and transcripts.
        </p>
      </div>
    </div>
  );
}
