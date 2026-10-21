import React, { useState, useEffect } from 'react';
import FloatingHeader from './components/FloatingHeader';
import ToolsDrawer, { ActiveView } from './components/ToolsDrawer';
import FloatingAssistant from './pages/FloatingAssistant';
import InterviewPractice from './pages/InterviewPractice';
import CodingPractice from './pages/CodingPractice';
import Transcription from './pages/Transcription';
import NotesHistory from './pages/NotesHistory';
import Settings from './pages/Settings';
import About from './pages/About';
import { ToastProvider } from './components/Toast';
import { SettingsProvider } from './context/SettingsContext';
import type { AudioSessionStatus } from '../shared/types';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('assistant');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [screenContextActive, setScreenContextActive] = useState(false);
  const [audioListeningStatus, setAudioListeningStatus] = useState<AudioSessionStatus>('idle');
  const [volumeLevel, setVolumeLevel] = useState<number>(0);

  useEffect(() => {
    window.api.window.getCollapsed().then(setIsCollapsed).catch(() => {});
  }, []);

  const handleToggleCollapse = async () => {
    try {
      const next = await window.api.window.toggleCollapse();
      setIsCollapsed(next);
      if (next) {
        setIsMenuOpen(false);
      }
    } catch (err) {
      console.error('Failed to toggle collapse:', err);
    }
  };

  return (
    <SettingsProvider>
      <ToastProvider>
        <div
          className={`flex flex-col h-screen w-screen overflow-hidden bg-charcoal-950/85 backdrop-blur-xl border border-charcoal-700/60 shadow-2xl transition-all duration-200 relative ${
            isCollapsed ? 'rounded-xl' : 'rounded-2xl'
          }`}
        >
          {/* Frameless floating titlebar */}
          <FloatingHeader
            screenContextActive={screenContextActive}
            audioListeningStatus={audioListeningStatus}
            volumeLevel={volumeLevel}
            onOpenMenu={() => setIsMenuOpen(!isMenuOpen)}
            isMenuOpen={isMenuOpen}
            isCollapsed={isCollapsed}
            onToggleCollapse={handleToggleCollapse}
          />

          {!isCollapsed && (
            <>
              {/* Navigation Drawer */}
              <ToolsDrawer
                isOpen={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
                activeView={activeView}
                onSelectView={(view) => setActiveView(view)}
              />

              {/* Secondary View Back Button */}
              {activeView !== 'assistant' && (
                <div className="px-3.5 py-1.5 bg-charcoal-900 border-b border-charcoal-800 flex items-center justify-between text-xs">
                  <button
                    onClick={() => setActiveView('assistant')}
                    className="flex items-center gap-1.5 text-violet-400 hover:text-violet-300 font-medium cursor-pointer"
                  >
                    <span>←</span>
                    <span>Back to Assistant</span>
                  </button>
                  <span className="text-gray-400 font-medium capitalize">{activeView}</span>
                </div>
              )}

              {/* View Container */}
              <main className="flex-1 overflow-hidden">
                {activeView === 'assistant' && (
                  <FloatingAssistant
                    onStatusUpdate={(screenActive, audioStatus, vol) => {
                      setScreenContextActive(screenActive);
                      setAudioListeningStatus(audioStatus);
                      setVolumeLevel(vol);
                    }}
                  />
                )}
                {activeView === 'interview' && (
                  <div className="h-full overflow-y-auto">
                    <InterviewPractice />
                  </div>
                )}
                {activeView === 'coding' && (
                  <div className="h-full overflow-y-auto">
                    <CodingPractice />
                  </div>
                )}
                {activeView === 'transcription' && (
                  <div className="h-full overflow-y-auto">
                    <Transcription />
                  </div>
                )}
                {activeView === 'notes' && (
                  <div className="h-full overflow-y-auto">
                    <NotesHistory />
                  </div>
                )}
                {activeView === 'settings' && (
                  <div className="h-full overflow-y-auto">
                    <Settings />
                  </div>
                )}
                {activeView === 'about' && (
                  <div className="h-full overflow-y-auto">
                    <About />
                  </div>
                )}
              </main>

              {/* Corner resize handle visual indicator */}
              <div
                className="absolute bottom-1 right-1 text-gray-500/40 select-none pointer-events-none text-[11px] font-mono leading-none tracking-tighter"
                title="Resize window"
              >
                ⤡
              </div>
            </>
          )}
        </div>
      </ToastProvider>
    </SettingsProvider>
  );
}
