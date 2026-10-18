import React from 'react';

export type ActiveView =
  | 'assistant'
  | 'interview'
  | 'coding'
  | 'transcription'
  | 'notes'
  | 'settings'
  | 'about';

interface ToolsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
}

const MENU_ITEMS: Array<{ id: ActiveView; label: string; icon: string; desc: string }> = [
  { id: 'assistant', label: 'Floating Assistant', icon: '✦', desc: 'Context-aware screen assistant' },
  { id: 'interview', label: 'Interview Practice', icon: '🎯', desc: 'Mock technical interviews & scorecards' },
  { id: 'coding', label: 'Coding Practice', icon: '⟨⟩', desc: 'Interactive coding challenges & reviews' },
  { id: 'transcription', label: 'Audio Transcription', icon: '🎙️', desc: 'Meeting & study session speech summary' },
  { id: 'notes', label: 'Notes & History', icon: '📋', desc: 'Saved chats, notes, and transcripts' },
  { id: 'settings', label: 'Settings', icon: '⚙', desc: 'API keys, models, and privacy controls' },
  { id: 'about', label: 'About & Diagnostics', icon: '◉', desc: 'System status & feature health' },
];

export default function ToolsDrawer({
  isOpen,
  onClose,
  activeView,
  onSelectView,
}: ToolsDrawerProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col justify-start animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-charcoal-900 border-b border-charcoal-700 shadow-2xl p-4 flex flex-col gap-2 animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-charcoal-800">
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            FocusPilot Navigation
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 gap-1.5 pt-1">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onSelectView(item.id);
                onClose();
              }}
              className={`flex items-center gap-3 p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                activeView === item.id
                  ? 'bg-violet-600/20 border border-violet-600/50 text-violet-200'
                  : 'bg-charcoal-800/60 hover:bg-charcoal-800 border border-transparent text-gray-300 hover:text-white'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{item.label}</div>
                <div className="text-[10px] text-gray-500 truncate">{item.desc}</div>
              </div>
              {activeView === item.id && <span className="text-xs text-violet-400">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
