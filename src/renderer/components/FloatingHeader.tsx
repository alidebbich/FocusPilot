import React, { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';

interface FloatingHeaderProps {
  screenContextActive: boolean;
  onOpenMenu: () => void;
  isMenuOpen: boolean;
}

export default function FloatingHeader({
  screenContextActive,
  onOpenMenu,
  isMenuOpen,
}: FloatingHeaderProps) {
  const { settings, updateSettings } = useSettings();
  const [isPinned, setIsPinned] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [opacity, setOpacity] = useState(settings.windowOpacity || 0.95);
  const [showOpacityMenu, setShowOpacityMenu] = useState(false);

  useEffect(() => {
    // Check initial pinned and collapsed status
    window.api.window.getAlwaysOnTop().then(setIsPinned).catch(() => {});
    window.api.window.getCollapsed().then(setIsCollapsed).catch(() => {});
  }, []);

  const togglePin = async () => {
    const next = !isPinned;
    const res = await window.api.window.setAlwaysOnTop(next);
    setIsPinned(res);
    updateSettings({ alwaysOnTop: res });
  };

  const toggleCollapse = async () => {
    const res = await window.api.window.toggleCollapse();
    setIsCollapsed(res);
  };

  const handleOpacityChange = (val: number) => {
    setOpacity(val);
    window.api.window.setOpacity(val);
    updateSettings({ windowOpacity: val });
    setShowOpacityMenu(false);
  };

  const minimize = () => window.api.window.minimize();
  const close = () => window.api.window.close();

  return (
    <header className="window-drag-region relative flex items-center justify-between h-[46px] px-3.5 bg-charcoal-900/90 border-b border-charcoal-800/80 backdrop-blur-md rounded-t-2xl select-none">
      {/* Left: Logo & Status */}
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center text-white text-[11px] font-bold shadow-md shadow-violet-900/40">
          FP
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-200 tracking-wide">FocusPilot</span>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-all ${
              screenContextActive
                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                : 'bg-charcoal-800 text-gray-400 border border-charcoal-700'
            }`}
            title={screenContextActive ? 'Screen context enabled' : 'Screen context paused/off'}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                screenContextActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'
              }`}
            />
            {screenContextActive ? 'Screen ON' : 'Screen OFF'}
          </span>
        </div>
      </div>

      {/* Right: Window Controls */}
      <div className="window-no-drag flex items-center gap-1 text-gray-400">
        {/* Opacity Menu */}
        <div className="relative">
          <button
            onClick={() => setShowOpacityMenu(!showOpacityMenu)}
            className="p-1.5 hover:text-gray-200 hover:bg-charcoal-800/80 rounded transition-colors text-xs cursor-pointer"
            title={`Opacity: ${Math.round(opacity * 100)}%`}
          >
            {Math.round(opacity * 100)}%
          </button>

          {showOpacityMenu && (
            <div className="absolute right-0 top-8 w-28 bg-charcoal-900 border border-charcoal-700 rounded-lg shadow-xl p-1.5 z-50 animate-fade-in flex flex-col gap-1 text-xs">
              {[1.0, 0.95, 0.85, 0.7].map((val) => (
                <button
                  key={val}
                  onClick={() => handleOpacityChange(val)}
                  className={`px-2 py-1 text-left rounded cursor-pointer transition-colors ${
                    Math.abs(opacity - val) < 0.02
                      ? 'bg-violet-600 text-white font-medium'
                      : 'text-gray-300 hover:bg-charcoal-800'
                  }`}
                >
                  {Math.round(val * 100)}% {val === 1.0 ? '(Solid)' : val === 0.7 ? '(Translucent)' : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pin (Always on top) */}
        <button
          onClick={togglePin}
          className={`p-1.5 rounded transition-colors text-xs cursor-pointer ${
            isPinned
              ? 'text-violet-400 bg-violet-600/20 hover:bg-violet-600/30'
              : 'hover:text-gray-200 hover:bg-charcoal-800/80'
          }`}
          title={isPinned ? 'Always on top: Enabled (click to unpin)' : 'Always on top: Disabled (click to pin)'}
        >
          📌
        </button>

        {/* Menu Toggle (Interview, Coding, History, Settings) */}
        <button
          onClick={onOpenMenu}
          className={`p-1.5 rounded transition-colors text-xs cursor-pointer ${
            isMenuOpen
              ? 'text-violet-400 bg-violet-600/20 hover:bg-violet-600/30'
              : 'hover:text-gray-200 hover:bg-charcoal-800/80'
          }`}
          title="Tools & Settings Menu"
        >
          ☰
        </button>

        {/* Collapse / Expand */}
        <button
          onClick={toggleCollapse}
          className="p-1.5 hover:text-gray-200 hover:bg-charcoal-800/80 rounded transition-colors text-xs cursor-pointer"
          title={isCollapsed ? 'Expand Assistant' : 'Collapse to Mini-bar'}
        >
          {isCollapsed ? '▼' : '▲'}
        </button>

        {/* Minimize */}
        <button
          onClick={minimize}
          className="p-1.5 hover:text-gray-200 hover:bg-charcoal-800/80 rounded transition-colors text-xs cursor-pointer"
          title="Minimize to taskbar"
        >
          —
        </button>

        {/* Close */}
        <button
          onClick={close}
          className="p-1.5 hover:text-red-400 hover:bg-red-950/40 rounded transition-colors text-xs cursor-pointer"
          title="Close FocusPilot"
        >
          ✕
        </button>
      </div>
    </header>
  );
}
