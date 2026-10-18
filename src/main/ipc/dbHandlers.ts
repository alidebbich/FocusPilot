import { ipcMain } from 'electron';
import { IPC } from '../../shared/types';
import type { Conversation, Note, InterviewSession, TranscriptSession } from '../../shared/types';
import {
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  clearAllConversations,
  listNotes,
  getNote,
  saveNote,
  deleteNote,
  listInterviewSessions,
  getInterviewSession,
  saveInterviewSession,
  deleteInterviewSession,
  listTranscripts,
  saveTranscript,
  deleteTranscript,
  deleteAllData,
} from '../database/db';

export function registerDbHandlers(): void {
  // ─── Conversations ─────────────────────────────────────────
  ipcMain.handle(IPC.CONV_LIST, () => listConversations());
  ipcMain.handle(IPC.CONV_GET, (_e, payload: unknown) => {
    const id = extractId(payload);
    return getConversation(id);
  });
  ipcMain.handle(IPC.CONV_SAVE, (_e, payload: unknown) => {
    const conv = payload as Conversation;
    if (!conv?.id) throw new Error('Invalid conversation');
    saveConversation(conv);
  });
  ipcMain.handle(IPC.CONV_DELETE, (_e, payload: unknown) => {
    deleteConversation(extractId(payload));
  });
  ipcMain.handle(IPC.CONV_CLEAR_ALL, () => clearAllConversations());

  // ─── Notes ────────────────────────────────────────────────
  ipcMain.handle(IPC.NOTES_LIST, () => listNotes());
  ipcMain.handle(IPC.NOTES_GET, (_e, payload: unknown) => getNote(extractId(payload)));
  ipcMain.handle(IPC.NOTES_SAVE, (_e, payload: unknown) => {
    const note = payload as Note;
    if (!note?.id) throw new Error('Invalid note');
    saveNote(note);
  });
  ipcMain.handle(IPC.NOTES_DELETE, (_e, payload: unknown) => {
    deleteNote(extractId(payload));
  });

  // ─── Interviews ───────────────────────────────────────────
  ipcMain.handle(IPC.INTERVIEW_LIST, () => listInterviewSessions());
  ipcMain.handle(IPC.INTERVIEW_GET, (_e, payload: unknown) =>
    getInterviewSession(extractId(payload))
  );
  ipcMain.handle(IPC.INTERVIEW_SAVE, (_e, payload: unknown) => {
    const session = payload as InterviewSession;
    if (!session?.id) throw new Error('Invalid interview session');
    saveInterviewSession(session);
  });
  ipcMain.handle(IPC.INTERVIEW_DELETE, (_e, payload: unknown) => {
    deleteInterviewSession(extractId(payload));
  });

  // ─── Transcripts ──────────────────────────────────────────
  ipcMain.handle(IPC.TRANSCRIPT_LIST, () => listTranscripts());
  ipcMain.handle(IPC.TRANSCRIPT_SAVE, (_e, payload: unknown) => {
    const session = payload as TranscriptSession;
    if (!session?.id) throw new Error('Invalid transcript');
    saveTranscript(session);
  });
  ipcMain.handle(IPC.TRANSCRIPT_DELETE, (_e, payload: unknown) => {
    deleteTranscript(extractId(payload));
  });

  // ─── Delete all ───────────────────────────────────────────
  ipcMain.handle(IPC.DATA_DELETE_ALL, () => deleteAllData());
}

function extractId(payload: unknown): string {
  if (!payload || typeof payload !== 'object') throw new Error('Missing id');
  const id = (payload as { id?: unknown }).id;
  if (typeof id !== 'string' || !id) throw new Error('Invalid id');
  return id;
}
