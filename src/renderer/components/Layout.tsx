import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: '◈' },
  { path: '/assistant', label: 'AI Assistant', icon: '✦' },
  { path: '/interview', label: 'Interview Practice', icon: '◎' },
  { path: '/coding', label: 'Coding Practice', icon: '⟨⟩' },
  { path: '/transcription', label: 'Transcription', icon: '⏺' },
  { path: '/screen', label: 'Screen Analysis', icon: '⊡' },
  { path: '/notes', label: 'Notes & History', icon: '◇' },
];

const BOTTOM_NAV: NavItem[] = [
  { path: '/settings', label: 'Settings', icon: '⚙' },
  { path: '/about', label: 'About', icon: '◉' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { settings, hasApiKey, loading } = useSettings();
  const location = useLocation();

  const pageTitles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/assistant': 'AI Assistant',
    '/interview': 'Interview Practice',
    '/coding': 'Coding Practice',
    '/transcription': 'Transcription',
    '/screen': 'Screen Analysis',
    '/notes': 'Notes & History',
    '/settings': 'Settings',
    '/about': 'About & Diagnostics',
  };

  const currentTitle = pageTitles[location.pathname] ?? 'FocusPilot AI';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-charcoal-950">
      {/* Sidebar */}
      <aside className="flex flex-col w-[220px] min-w-[220px] bg-charcoal-900 border-r border-charcoal-800">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-charcoal-800">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-violet-900/40">
            FP
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-100">FocusPilot</div>
            <div className="text-xs text-gray-500">AI Assistant</div>
          </div>
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <div className="section-title px-3">Workspace</div>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-all duration-150
                 ${isActive
                   ? 'bg-violet-600/20 text-violet-300 border border-violet-600/30'
                   : 'text-gray-400 hover:text-gray-200 hover:bg-charcoal-800'
                 }`
              }
            >
              <span className="text-base w-5 text-center leading-none">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="py-3 px-2 border-t border-charcoal-800">
          {BOTTOM_NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-all duration-150
                 ${isActive
                   ? 'bg-charcoal-700 text-gray-200 border border-charcoal-600'
                   : 'text-gray-500 hover:text-gray-300 hover:bg-charcoal-800'
                 }`
              }
            >
              <span className="text-base w-5 text-center leading-none">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 h-14 border-b border-charcoal-800 bg-charcoal-900/50 backdrop-blur-sm flex-shrink-0">
          <h1 className="text-sm font-semibold text-gray-200">{currentTitle}</h1>
          <div className="flex items-center gap-3">
            {!loading && (
              <div className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-full border ${
                hasApiKey
                  ? 'border-green-800 bg-green-900/20 text-green-400'
                  : 'border-yellow-800 bg-yellow-900/20 text-yellow-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${hasApiKey ? 'bg-green-400' : 'bg-yellow-400'} ${hasApiKey ? 'animate-pulse-slow' : ''}`} />
                {hasApiKey ? `${settings.provider} • ${settings.model}` : 'No API key'}
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
