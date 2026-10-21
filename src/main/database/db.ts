import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import type {
  Conversation,
  Note,
  InterviewSession,
  TranscriptSession,
} from '../../shared/types';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export async function initDatabase(): Promise<void> {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'focuspilot.db');

  console.log('[DB] Opening database at:', dbPath);

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);
  console.log('[DB] Database ready');
}

function runMigrations(db: Database.Database): void {
  const currentVersion = Number(db.pragma('user_version', { simple: true }) || 0);

  if (currentVersion < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        system_instruction TEXT,
        messages_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS interview_sessions (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        difficulty TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        questions_json TEXT NOT NULL DEFAULT '[]',
        summary TEXT
      );

      CREATE TABLE IF NOT EXISTS transcripts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        duration INTEGER,
        transcript TEXT NOT NULL,
        summary TEXT,
        mic_label TEXT
      );
    `);
    db.pragma('user_version = 1');
    console.log('[DB] Migration to v1 complete');
  }
}

// ─── Conversations ───────────────────────────────────────────
export function listConversations() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, title, created_at, updated_at, messages_json
       FROM conversations ORDER BY updated_at DESC LIMIT 100`
    )
    .all() as Array<{
    id: string;
    title: string;
    created_at: number;
    updated_at: number;
    messages_json: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    messageCount: JSON.parse(r.messages_json).length,
    preview: (() => {
      const msgs = JSON.parse(r.messages_json);
      const last = msgs[msgs.length - 1];
      return last ? String(last.content).slice(0, 100) : '';
    })(),
  }));
}

export function getConversation(id: string): Conversation | null {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id) as
    | {
        id: string;
        title: string;
        created_at: number;
        updated_at: number;
        system_instruction?: string;
        messages_json: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    systemInstruction: row.system_instruction,
    messages: JSON.parse(row.messages_json),
  };
}

export function saveConversation(conv: Conversation): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO conversations (id, title, created_at, updated_at, system_instruction, messages_json)
     VALUES (@id, @title, @createdAt, @updatedAt, @systemInstruction, @messagesJson)
     ON CONFLICT(id) DO UPDATE SET
       title = @title,
       updated_at = @updatedAt,
       system_instruction = @systemInstruction,
       messages_json = @messagesJson`
  ).run({
    id: conv.id,
    title: conv.title,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
    systemInstruction: conv.systemInstruction ?? null,
    messagesJson: JSON.stringify(conv.messages),
  });
}

export function deleteConversation(id: string): void {
  getDb().prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

export function clearAllConversations(): void {
  getDb().prepare('DELETE FROM conversations').run();
}

// ─── Notes ───────────────────────────────────────────────────
export function listNotes(): Note[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM notes ORDER BY updated_at DESC')
    .all() as Array<{
    id: string;
    title: string;
    content: string;
    tags_json: string;
    created_at: number;
    updated_at: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    tags: JSON.parse(r.tags_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getNote(id: string): Note | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as
    | { id: string; title: string; content: string; tags_json: string; created_at: number; updated_at: number }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: JSON.parse(row.tags_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function saveNote(note: Note): void {
  getDb()
    .prepare(
      `INSERT INTO notes (id, title, content, tags_json, created_at, updated_at)
       VALUES (@id, @title, @content, @tagsJson, @createdAt, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         title = @title,
         content = @content,
         tags_json = @tagsJson,
         updated_at = @updatedAt`
    )
    .run({
      id: note.id,
      title: note.title,
      content: note.content,
      tagsJson: JSON.stringify(note.tags),
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    });
}

export function deleteNote(id: string): void {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id);
}

// ─── Interview Sessions ───────────────────────────────────────
export function listInterviewSessions(): InterviewSession[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM interview_sessions ORDER BY started_at DESC')
    .all() as Array<{
    id: string;
    subject: string;
    difficulty: string;
    started_at: number;
    ended_at?: number;
    questions_json: string;
    summary?: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject as InterviewSession['subject'],
    difficulty: r.difficulty as InterviewSession['difficulty'],
    startedAt: r.started_at,
    endedAt: r.ended_at,
    questions: JSON.parse(r.questions_json),
    summary: r.summary,
  }));
}

export function getInterviewSession(id: string): InterviewSession | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM interview_sessions WHERE id = ?').get(id) as
    | { id: string; subject: string; difficulty: string; started_at: number; ended_at?: number; questions_json: string; summary?: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    subject: row.subject as InterviewSession['subject'],
    difficulty: row.difficulty as InterviewSession['difficulty'],
    startedAt: row.started_at,
    endedAt: row.ended_at,
    questions: JSON.parse(row.questions_json),
    summary: row.summary,
  };
}

export function saveInterviewSession(session: InterviewSession): void {
  getDb()
    .prepare(
      `INSERT INTO interview_sessions (id, subject, difficulty, started_at, ended_at, questions_json, summary)
       VALUES (@id, @subject, @difficulty, @startedAt, @endedAt, @questionsJson, @summary)
       ON CONFLICT(id) DO UPDATE SET
         ended_at = @endedAt,
         questions_json = @questionsJson,
         summary = @summary`
    )
    .run({
      id: session.id,
      subject: session.subject,
      difficulty: session.difficulty,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? null,
      questionsJson: JSON.stringify(session.questions),
      summary: session.summary ?? null,
    });
}

export function deleteInterviewSession(id: string): void {
  getDb().prepare('DELETE FROM interview_sessions WHERE id = ?').run(id);
}

// ─── Transcripts ─────────────────────────────────────────────
export function listTranscripts(): TranscriptSession[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM transcripts ORDER BY created_at DESC')
    .all() as Array<{
    id: string;
    title: string;
    created_at: number;
    duration?: number;
    transcript: string;
    summary?: string;
    mic_label?: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    duration: r.duration,
    transcript: r.transcript,
    summary: r.summary,
    micLabel: r.mic_label,
  }));
}

export function saveTranscript(session: TranscriptSession): void {
  getDb()
    .prepare(
      `INSERT INTO transcripts (id, title, created_at, duration, transcript, summary, mic_label)
       VALUES (@id, @title, @createdAt, @duration, @transcript, @summary, @micLabel)
       ON CONFLICT(id) DO UPDATE SET
         title = @title,
         duration = @duration,
         transcript = @transcript,
         summary = @summary,
         mic_label = @micLabel`
    )
    .run({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      duration: session.duration ?? null,
      transcript: session.transcript,
      summary: session.summary ?? null,
      micLabel: session.micLabel ?? null,
    });
}

export function deleteTranscript(id: string): void {
  getDb().prepare('DELETE FROM transcripts WHERE id = ?').run(id);
}

// ─── Delete All ───────────────────────────────────────────────
export function deleteAllData(): void {
  const db = getDb();
  db.exec(`
    DELETE FROM conversations;
    DELETE FROM notes;
    DELETE FROM interview_sessions;
    DELETE FROM transcripts;
  `);
}
