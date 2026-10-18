import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '../components/Toast';
import type { Note, ConversationSummary, InterviewSession, TranscriptSession } from '../../../shared/types';

type Tab = 'notes' | 'conversations' | 'interviews' | 'transcripts';

export default function NotesHistory() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('notes');
  const [notes, setNotes] = useState<Note[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [interviews, setInterviews] = useState<InterviewSession[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptSession[]>([]);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [n, c, i, t] = await Promise.all([
      window.api.notes.list(),
      window.api.conversations.list(),
      window.api.interviews.list(),
      window.api.transcripts.list(),
    ]);
    setNotes(n);
    setConversations(c);
    setInterviews(i);
    setTranscripts(t);
  }

  async function saveNote() {
    if (!editingNote) return;
    await window.api.notes.save(editingNote);
    await loadAll();
    setEditingNote(null);
    showToast('success', 'Note saved');
  }

  async function deleteNote(id: string) {
    await window.api.notes.delete(id);
    await loadAll();
    showToast('success', 'Note deleted');
  }

  async function deleteConversation(id: string) {
    await window.api.conversations.delete(id);
    await loadAll();
    showToast('success', 'Conversation deleted');
  }

  async function deleteInterview(id: string) {
    await window.api.interviews.delete(id);
    await loadAll();
    showToast('success', 'Session deleted');
  }

  async function deleteTranscript(id: string) {
    await window.api.transcripts.delete(id);
    await loadAll();
    showToast('success', 'Transcript deleted');
  }

  function newNote() {
    setEditingNote({
      id: uuidv4(),
      title: '',
      content: '',
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setTab('notes');
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'notes', label: 'Notes', count: notes.length },
    { id: 'conversations', label: 'Conversations', count: conversations.length },
    { id: 'interviews', label: 'Interviews', count: interviews.length },
    { id: 'transcripts', label: 'Transcripts', count: transcripts.length },
  ];

  const filterText = searchQuery.toLowerCase();

  return (
    <div className="flex h-full">
      {/* Note editor panel */}
      {editingNote && (
        <div className="flex flex-col w-80 border-r border-charcoal-800 p-4">
          <div className="section-title">Edit Note</div>
          <input
            className="input mb-3"
            placeholder="Title"
            value={editingNote.title}
            onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value, updatedAt: Date.now() })}
          />
          <textarea
            className="input flex-1 min-h-[200px] resize-none font-mono text-xs mb-3"
            placeholder="Write your note here…"
            value={editingNote.content}
            onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value, updatedAt: Date.now() })}
          />
          <div className="flex gap-2">
            <button className="btn-primary flex-1 btn-sm" onClick={saveNote}>Save</button>
            <button className="btn-ghost btn-sm" onClick={() => setEditingNote(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-100">Notes & History</h2>
          <div className="flex gap-3">
            <input
              className="input w-48"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button className="btn-primary btn-sm" onClick={newNote}>
              + New Note
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-charcoal-800 pb-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-all cursor-pointer
                ${tab === t.id
                  ? 'text-violet-300 border-b-2 border-violet-500 -mb-px bg-violet-600/5'
                  : 'text-gray-500 hover:text-gray-300'
                }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
                  tab === t.id ? 'bg-violet-600/30 text-violet-300' : 'bg-charcoal-700 text-gray-500'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Notes */}
          {tab === 'notes' && (
            <div className="grid grid-cols-2 gap-3">
              {notes
                .filter((n) => !filterText || n.title.toLowerCase().includes(filterText) || n.content.toLowerCase().includes(filterText))
                .map((note) => (
                  <div key={note.id} className="card group relative">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-200 truncate flex-1">
                        {note.title || 'Untitled'}
                      </h4>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <button
                          className="text-xs text-gray-500 hover:text-violet-400"
                          onClick={() => setEditingNote({ ...note })}
                        >Edit</button>
                        <button
                          className="text-xs text-gray-500 hover:text-red-400"
                          onClick={() => deleteNote(note.id)}
                        >Delete</button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-3">{note.content}</p>
                    <p className="text-xs text-gray-700 mt-2">{new Date(note.updatedAt).toLocaleDateString()}</p>
                  </div>
                ))}
              {notes.length === 0 && (
                <div className="col-span-2 text-center py-12 text-gray-600 text-sm">
                  No notes yet. Click "+ New Note" to create one.
                </div>
              )}
            </div>
          )}

          {/* Conversations */}
          {tab === 'conversations' && (
            <div className="space-y-2">
              {conversations
                .filter((c) => !filterText || c.title.toLowerCase().includes(filterText))
                .map((conv) => (
                  <div key={conv.id} className="card group flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-200 truncate">{conv.title}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{conv.preview}</p>
                      <p className="text-xs text-gray-700 mt-1">
                        {conv.messageCount} messages • {new Date(conv.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-xs text-gray-600 hover:text-red-400 ml-3 flex-shrink-0"
                      onClick={() => deleteConversation(conv.id)}
                    >Delete</button>
                  </div>
                ))}
              {conversations.length === 0 && (
                <p className="text-center py-12 text-gray-600 text-sm">No conversations yet.</p>
              )}
            </div>
          )}

          {/* Interviews */}
          {tab === 'interviews' && (
            <div className="space-y-2">
              {interviews
                .filter((i) => !filterText || i.subject.includes(filterText))
                .map((session) => (
                  <div key={session.id} className="card group flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-200 capitalize">{session.subject}</span>
                        <span className={`badge ${
                          session.difficulty === 'beginner' ? 'badge-green' :
                          session.difficulty === 'intermediate' ? 'badge-yellow' : 'badge-red'
                        } capitalize`}>{session.difficulty}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {session.questions.length} questions • {new Date(session.startedAt).toLocaleDateString()}
                      </p>
                      {session.summary && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{session.summary}</p>
                      )}
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-xs text-gray-600 hover:text-red-400 ml-3"
                      onClick={() => deleteInterview(session.id)}
                    >Delete</button>
                  </div>
                ))}
              {interviews.length === 0 && (
                <p className="text-center py-12 text-gray-600 text-sm">No interview sessions yet.</p>
              )}
            </div>
          )}

          {/* Transcripts */}
          {tab === 'transcripts' && (
            <div className="space-y-2">
              {transcripts
                .filter((t) => !filterText || t.title.toLowerCase().includes(filterText) || t.transcript.toLowerCase().includes(filterText))
                .map((s) => (
                  <div key={s.id} className="card group">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-200">{s.title}</p>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.transcript}</p>
                        <p className="text-xs text-gray-700 mt-1">{new Date(s.createdAt).toLocaleDateString()}</p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 ml-3">
                        <button
                          className="text-xs text-gray-500 hover:text-violet-400"
                          onClick={() => navigator.clipboard.writeText(s.transcript)}
                        >Copy</button>
                        <button
                          className="text-xs text-gray-500 hover:text-red-400"
                          onClick={() => deleteTranscript(s.id)}
                        >Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              {transcripts.length === 0 && (
                <p className="text-center py-12 text-gray-600 text-sm">No transcripts yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
