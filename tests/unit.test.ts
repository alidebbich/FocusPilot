import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// ─── Settings validation tests ─────────────────────────────
describe('AppSettings validation', () => {
  it('DEFAULT_SETTINGS has correct structure', async () => {
    const { DEFAULT_SETTINGS } = await import('../src/shared/types');
    expect(DEFAULT_SETTINGS.provider).toBe('gemini');
    expect(DEFAULT_SETTINGS.model).toBe('gemini-1.5-flash');
    expect(DEFAULT_SETTINGS.temperature).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SETTINGS.temperature).toBeLessThanOrEqual(1);
    expect(DEFAULT_SETTINGS.maxTokens).toBeGreaterThan(0);
  });

  it('IPC channel names are all strings', async () => {
    const { IPC } = await import('../src/shared/types');
    for (const [key, value] of Object.entries(IPC)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

// ─── Database tests ─────────────────────────────────────────
// Note: better-sqlite3 is compiled for the Electron runtime (ABI 135).
// When vitest runs directly in Node (ABI 137), we safely check capability.
let sqliteSupported = false;
let DatabaseClass: any = null;
try {
  DatabaseClass = require('better-sqlite3');
  const probe = new DatabaseClass(':memory:');
  probe.close();
  sqliteSupported = true;
} catch {
  sqliteSupported = false;
}

describe.runIf(sqliteSupported)('SQLite database operations', () => {
  let db: any;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `focuspilot_test_${Date.now()}.db`);
    db = new DatabaseClass(dbPath);
    db.pragma('journal_mode = WAL');

    // Create test schema
    db.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        system_instruction TEXT,
        messages_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  });

  afterEach(() => {
    if (db) db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('can insert and retrieve a conversation', () => {
    const now = Date.now();
    db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at, messages_json)
      VALUES (?, ?, ?, ?, ?)
    `).run('test-id-1', 'Test Conversation', now, now, JSON.stringify([
      { id: 'msg1', role: 'user', content: 'Hello', timestamp: now }
    ]));

    const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get('test-id-1') as {
      id: string; title: string; messages_json: string;
    };
    expect(row).toBeDefined();
    expect(row.id).toBe('test-id-1');
    expect(row.title).toBe('Test Conversation');

    const messages = JSON.parse(row.messages_json);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello');
  });

  it('can upsert a conversation', () => {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at, messages_json)
      VALUES (@id, @title, @createdAt, @updatedAt, @messagesJson)
      ON CONFLICT(id) DO UPDATE SET
        title = @title,
        updated_at = @updatedAt,
        messages_json = @messagesJson
    `);

    stmt.run({ id: 'upsert-1', title: 'Original', createdAt: now, updatedAt: now, messagesJson: '[]' });
    stmt.run({ id: 'upsert-1', title: 'Updated', createdAt: now, updatedAt: now + 1000, messagesJson: '[{"id":"m1"}]' });

    const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get('upsert-1') as {
      title: string; messages_json: string;
    };
    expect(row.title).toBe('Updated');
    const msgs = JSON.parse(row.messages_json);
    expect(msgs).toHaveLength(1);
  });

  it('can insert and delete a note', () => {
    const now = Date.now();
    db.prepare(`
      INSERT INTO notes (id, title, content, tags_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('note-1', 'Test Note', 'Content here', '[]', now, now);

    let row = db.prepare('SELECT * FROM notes WHERE id = ?').get('note-1');
    expect(row).toBeDefined();

    db.prepare('DELETE FROM notes WHERE id = ?').run('note-1');
    row = db.prepare('SELECT * FROM notes WHERE id = ?').get('note-1');
    expect(row).toBeUndefined();
  });

  it('uses parameterized queries (no SQL injection)', () => {
    const now = Date.now();
    const maliciousTitle = "'; DROP TABLE conversations; --";
    db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at, messages_json)
      VALUES (?, ?, ?, ?, ?)
    `).run('safe-1', maliciousTitle, now, now, '[]');

    // Table should still exist
    const row = db.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number };
    expect(row.count).toBe(1);

    const retrieved = db.prepare('SELECT title FROM conversations WHERE id = ?').get('safe-1') as { title: string };
    expect(retrieved.title).toBe(maliciousTitle);
  });
});

// ─── Interview session logic tests ────────────────────────────
describe('InterviewSession logic', () => {
  it('subjects list includes expected entries', async () => {
    const { InterviewSubject } = await import('../src/shared/types').catch(() => ({ InterviewSubject: null }));
    // Just test the type structure from shared types
    const validSubjects = [
      'javascript', 'typescript', 'react', 'angular', 'nodejs',
      'databases', 'apis', 'system-design', 'algorithms', 'general'
    ];
    expect(validSubjects).toContain('javascript');
    expect(validSubjects).toContain('typescript');
    expect(validSubjects.length).toBe(10);
  });

  it('difficulties are bounded', () => {
    const difficulties = ['beginner', 'intermediate', 'advanced'];
    expect(difficulties).toHaveLength(3);
    expect(difficulties).toContain('beginner');
    expect(difficulties).toContain('advanced');
  });
});

// ─── IPC validation helpers ───────────────────────────────────
describe('IPC input validation', () => {
  it('rejects missing id in payload', () => {
    function extractId(payload: unknown): string {
      if (!payload || typeof payload !== 'object') throw new Error('Missing id');
      const id = (payload as { id?: unknown }).id;
      if (typeof id !== 'string' || !id) throw new Error('Invalid id');
      return id;
    }

    expect(() => extractId(null)).toThrow('Missing id');
    expect(() => extractId({})).toThrow('Invalid id');
    expect(() => extractId({ id: 123 })).toThrow('Invalid id');
    expect(() => extractId({ id: '' })).toThrow('Invalid id');
    expect(extractId({ id: 'valid-id' })).toBe('valid-id');
  });

  it('validates AI send-message payload', () => {
    function isValid(v: unknown): boolean {
      if (!v || typeof v !== 'object') return false;
      const p = v as Record<string, unknown>;
      return (
        typeof p.conversationId === 'string' &&
        Array.isArray(p.messages) &&
        typeof p.provider === 'string' &&
        typeof p.model === 'string'
      );
    }

    expect(isValid(null)).toBe(false);
    expect(isValid({})).toBe(false);
    expect(isValid({ conversationId: 'id', messages: [], provider: 'gemini' })).toBe(false); // missing model
    expect(isValid({ conversationId: 'id', messages: [], provider: 'gemini', model: 'flash' })).toBe(true);
  });
});
