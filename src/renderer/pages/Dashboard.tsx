import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import type { ConversationSummary, InterviewSession } from '../../shared/types';

export default function Dashboard() {
  const navigate = useNavigate();
  const { settings, hasApiKey } = useSettings();
  const [recentConvs, setRecentConvs] = useState<ConversationSummary[]>([]);
  const [recentInterviews, setRecentInterviews] = useState<InterviewSession[]>([]);

  useEffect(() => {
    window.api.conversations.list().then((list) => setRecentConvs(list.slice(0, 3)));
    window.api.interviews.list().then((list) => setRecentInterviews(list.slice(0, 3)));
  }, []);

  const quickActions = [
    { label: 'Start AI Chat', desc: 'Ask anything, get smart answers', icon: '✦', path: '/assistant', color: 'from-violet-700 to-violet-600' },
    { label: 'Mock Interview', desc: 'Practice with AI feedback', icon: '◎', path: '/interview', color: 'from-blue-700 to-blue-600' },
    { label: 'Coding Practice', desc: 'Paste code for explanations', icon: '⟨⟩', path: '/coding', color: 'from-indigo-700 to-indigo-600' },
    { label: 'Transcribe Session', desc: 'Record & transcribe audio', icon: '⏺', path: '/transcription', color: 'from-teal-700 to-teal-600' },
    { label: 'Analyze Screen', desc: 'Capture & explain visuals', icon: '⊡', path: '/screen', color: 'from-pink-700 to-pink-600' },
    { label: 'Notes & History', desc: 'Browse saved sessions', icon: '◇', path: '/notes', color: 'from-orange-700 to-orange-600' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      {/* Welcome */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-100 mb-1">
          Welcome to FocusPilot AI
        </h2>
        <p className="text-gray-400 text-sm">
          Your privacy-conscious productivity and learning assistant.
        </p>
      </div>

      {/* Provider status banner */}
      {!hasApiKey && (
        <div className="mb-6 flex items-center gap-4 p-4 rounded-xl border border-yellow-800/60 bg-yellow-900/10">
          <span className="text-yellow-400 text-2xl">⚠</span>
          <div className="flex-1">
            <p className="text-yellow-300 font-medium text-sm">No AI provider configured</p>
            <p className="text-yellow-500 text-xs mt-0.5">
              Add your Gemini API key in Settings to start using AI features.
              Get a free key at{' '}
              <span className="underline cursor-pointer text-yellow-400">
                aistudio.google.com
              </span>
            </p>
          </div>
          <button className="btn-primary btn-sm" onClick={() => navigate('/settings')}>
            Configure
          </button>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-8">
        <div className="section-title">Quick Actions</div>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="group text-left p-4 rounded-xl border border-charcoal-700 bg-charcoal-800
                         hover:border-charcoal-600 hover:bg-charcoal-750 transition-all duration-150
                         active:scale-[0.98] cursor-pointer"
            >
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${action.color} flex items-center justify-center
                               text-white text-lg mb-3 shadow-lg group-hover:scale-105 transition-transform`}>
                {action.icon}
              </div>
              <div className="font-semibold text-gray-200 text-sm mb-0.5">{action.label}</div>
              <div className="text-xs text-gray-500">{action.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Conversations */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="section-title mb-0">Recent Conversations</div>
            <button className="text-xs text-violet-400 hover:text-violet-300" onClick={() => navigate('/notes')}>
              View all →
            </button>
          </div>
          {recentConvs.length === 0 ? (
            <EmptyState
              icon="✦"
              message="No conversations yet"
              hint="Start chatting with the AI assistant"
              action={() => navigate('/assistant')}
              actionLabel="Start Chat"
            />
          ) : (
            <div className="space-y-2">
              {recentConvs.map((conv) => (
                <div
                  key={conv.id}
                  className="card-hover p-3 group"
                  onClick={() => navigate('/assistant')}
                >
                  <div className="flex items-start justify-between">
                    <p className="text-sm font-medium text-gray-200 truncate flex-1 mr-2">{conv.title}</p>
                    <span className="text-xs text-gray-600 flex-shrink-0">
                      {formatRelative(conv.updatedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{conv.preview}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Interviews */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="section-title mb-0">Recent Interviews</div>
            <button className="text-xs text-violet-400 hover:text-violet-300" onClick={() => navigate('/notes')}>
              View all →
            </button>
          </div>
          {recentInterviews.length === 0 ? (
            <EmptyState
              icon="◎"
              message="No practice sessions yet"
              hint="Start a mock interview to get AI feedback"
              action={() => navigate('/interview')}
              actionLabel="Practice Now"
            />
          ) : (
            <div className="space-y-2">
              {recentInterviews.map((session) => (
                <div key={session.id} className="card-hover p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-200 capitalize">{session.subject}</span>
                    <span className={`badge ${
                      session.difficulty === 'beginner' ? 'badge-green' :
                      session.difficulty === 'intermediate' ? 'badge-yellow' : 'badge-red'
                    }`}>
                      {session.difficulty}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {session.questions.length} question{session.questions.length !== 1 ? 's' : ''} •{' '}
                    {formatRelative(session.startedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status card */}
      <div className="mt-6 p-4 rounded-xl border border-charcoal-700 bg-charcoal-800/50 flex items-center gap-6">
        <div className="text-center">
          <div className={`w-3 h-3 rounded-full mx-auto mb-1 ${hasApiKey ? 'bg-green-400 animate-pulse-slow' : 'bg-yellow-400'}`} />
          <div className="text-xs text-gray-500">{hasApiKey ? 'Connected' : 'Not configured'}</div>
        </div>
        <div className="h-8 w-px bg-charcoal-700" />
        <div>
          <div className="text-xs font-medium text-gray-300">{settings.provider.toUpperCase()} — {settings.model}</div>
          <div className="text-xs text-gray-500">AI Provider</div>
        </div>
        <div className="h-8 w-px bg-charcoal-700" />
        <div>
          <div className="text-xs font-medium text-gray-300">{recentConvs.length} conversations</div>
          <div className="text-xs text-gray-500">Stored locally</div>
        </div>
        <div className="ml-auto">
          <button className="btn-secondary btn-sm" onClick={() => navigate('/about')}>
            Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  icon, message, hint, action, actionLabel
}: {
  icon: string;
  message: string;
  hint: string;
  action: () => void;
  actionLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 rounded-xl border border-dashed border-charcoal-700 text-center">
      <div className="text-2xl text-charcoal-600 mb-2">{icon}</div>
      <p className="text-sm text-gray-400 font-medium mb-1">{message}</p>
      <p className="text-xs text-gray-600 mb-3">{hint}</p>
      <button className="btn-secondary btn-sm" onClick={action}>{actionLabel}</button>
    </div>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
