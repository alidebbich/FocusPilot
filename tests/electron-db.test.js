const path = require('path');
const os = require('os');
const fs = require('fs');
const Database = require('better-sqlite3');

console.log('--- FocusPilot Electron SQLite Verification ---');

const testDbPath = path.join(os.tmpdir(), `focuspilot_electron_test_${Date.now()}.db`);
const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');

try {
  // 1. Schema setup
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

    CREATE TABLE IF NOT EXISTS interviews (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      turns_json TEXT NOT NULL DEFAULT '[]',
      feedback_json TEXT
    );

    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      audio_duration INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      text TEXT NOT NULL,
      summary TEXT,
      action_items_json TEXT NOT NULL DEFAULT '[]'
    );
  `);
  console.log('✓ Schema initialization passed');

  // 2. Insert and retrieve conversation
  const now = Date.now();
  const insertConv = db.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at, messages_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertConv.run('conv-1', 'Electron Test Chat', now, now, JSON.stringify([
    { id: 'm1', role: 'user', content: 'What is Electron?', timestamp: now },
    { id: 'm2', role: 'assistant', content: 'Electron lets you build desktop apps with JS/TS.', timestamp: now + 500 }
  ]));

  const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-1');
  if (!conv || conv.title !== 'Electron Test Chat') throw new Error('Conversation retrieval failed');
  const msgs = JSON.parse(conv.messages_json);
  if (msgs.length !== 2) throw new Error('Conversation message count mismatch');
  console.log('✓ Conversation insert & retrieval passed');

  // 3. Upsert conversation
  const upsertConv = db.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at, messages_json)
    VALUES (@id, @title, @createdAt, @updatedAt, @messagesJson)
    ON CONFLICT(id) DO UPDATE SET
      title = @title,
      updated_at = @updatedAt,
      messages_json = @messagesJson
  `);
  upsertConv.run({
    id: 'conv-1',
    title: 'Updated Chat Title',
    createdAt: now,
    updatedAt: now + 1000,
    messagesJson: JSON.stringify([...msgs, { id: 'm3', role: 'user', content: 'Nice!', timestamp: now + 1000 }])
  });

  const updatedConv = db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-1');
  if (updatedConv.title !== 'Updated Chat Title') throw new Error('Conversation upsert failed');
  if (JSON.parse(updatedConv.messages_json).length !== 3) throw new Error('Message append failed');
  console.log('✓ Conversation upsert passed');

  // 4. Notes CRUD
  const insertNote = db.prepare(`
    INSERT INTO notes (id, title, content, tags_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertNote.run('note-1', 'TypeScript Cheatsheet', 'Types vs Interfaces', JSON.stringify(['ts', 'cheatsheet']), now, now);

  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get('note-1');
  if (!note || note.title !== 'TypeScript Cheatsheet') throw new Error('Note retrieval failed');

  db.prepare('DELETE FROM notes WHERE id = ?').run('note-1');
  const deletedNote = db.prepare('SELECT * FROM notes WHERE id = ?').get('note-1');
  if (deletedNote !== undefined) throw new Error('Note deletion failed');
  console.log('✓ Notes CRUD passed');

  // 5. Parameterized SQL injection prevention
  const attackPayload = "'; DROP TABLE conversations; --";
  db.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at, messages_json)
    VALUES (?, ?, ?, ?, ?)
  `).run('conv-safe', attackPayload, now, now, '[]');

  const checkTable = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='conversations'").get();
  if (checkTable.count !== 1) throw new Error('SQL Injection vulnerability detected!');
  const safeConv = db.prepare('SELECT title FROM conversations WHERE id = ?').get('conv-safe');
  if (safeConv.title !== attackPayload) throw new Error('Payload corrupted');
  console.log('✓ Parameterized query safety passed');

  console.log('--- ALL ELECTRON SQLITE VERIFICATIONS PASSED ---');
  db.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  process.exit(0);
} catch (err) {
  console.error('Electron SQLite verification failed:', err);
  if (db) db.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  process.exit(1);
}
