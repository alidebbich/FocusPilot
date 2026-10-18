import React, { useState, useEffect } from 'react';
import type { DiagnosticsReport } from '../../../shared/types';

export default function About() {
  const [diag, setDiag] = useState<DiagnosticsReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.diag.get().then((d) => {
      setDiag(d);
      setLoading(false);
    });
  }, []);

  const statusConfig = {
    pass: { color: 'text-green-400', bg: 'bg-green-900/20 border-green-800', icon: '✓' },
    fail: { color: 'text-red-400', bg: 'bg-red-900/20 border-red-800', icon: '✕' },
    warning: { color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800', icon: '⚠' },
    'not-configured': { color: 'text-gray-400', bg: 'bg-charcoal-800 border-charcoal-700', icon: '○' },
    'not-tested': { color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-800', icon: '?' },
  };

  return (
    <div className="p-6 max-w-2xl mx-auto animate-fade-in">
      <h2 className="text-xl font-bold text-gray-100 mb-1">About & Diagnostics</h2>
      <p className="text-gray-500 text-sm mb-6">
        FocusPilot AI — Privacy-conscious productivity and learning assistant
      </p>

      {loading ? (
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <div className="w-4 h-4 border border-violet-400 border-t-transparent rounded-full animate-spin" />
          Loading diagnostics…
        </div>
      ) : diag ? (
        <>
          {/* App info */}
          <div className="card mb-5">
            <div className="section-title">Application</div>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              {[
                ['Version', diag.appVersion],
                ['Electron', diag.electronVersion],
                ['Node.js', diag.nodeVersion],
                ['Platform', diag.platform],
              ].map(([k, v]) => (
                <React.Fragment key={k}>
                  <span className="text-gray-500">{k}</span>
                  <span className="text-gray-300 font-mono text-xs">{v}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Feature diagnostics */}
          <div className="card mb-5">
            <div className="section-title">Feature Status</div>
            <div className="space-y-2">
              {diag.features.map((feature) => {
                const cfg = statusConfig[feature.status];
                return (
                  <div key={feature.name} className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.bg}`}>
                    <span className={`${cfg.color} font-bold text-sm flex-shrink-0 mt-0.5`}>
                      {cfg.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-200 font-medium">{feature.name}</span>
                        <span className={`text-xs ${cfg.color} capitalize`}>
                          {feature.status.replace('-', ' ')}
                        </span>
                      </div>
                      {feature.detail && (
                        <p className="text-xs text-gray-500 mt-0.5">{feature.detail}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="card">
            <div className="section-title">Notes</div>
            <div className="space-y-2 text-xs text-gray-500">
              <p>• This application stores all data locally. No data leaves your machine except API requests to your configured provider.</p>
              <p>• The Gemini API is a paid service. Check your quota and pricing at <span className="text-violet-400">aistudio.google.com</span>.</p>
              <p>• Transcription uses the browser Web Speech API which may route audio through Google's servers.</p>
              <p>• Screen capture is always explicit and user-initiated. No background capture occurs.</p>
              <p>• API keys are stored in your OS credential manager (keytar) when available, not in any config file.</p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-red-400 text-sm">Failed to load diagnostics.</p>
      )}
    </div>
  );
}
