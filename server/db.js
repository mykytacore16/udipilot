// Lokalna baza SQLite (wbudowany moduł node:sqlite – bez zewnętrznych usług).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.env.DB_FILE || fileURLToPath(new URL('../data/udipilot.db', import.meta.url));
mkdirSync(dirname(file), { recursive: true });
export const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS wnioski (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL,
  year INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  request_date TEXT,
  deadline TEXT NOT NULL,
  deadline_explanation TEXT,
  status TEXT NOT NULL DEFAULT 'nowy',
  extension_until TEXT,
  extension_reason TEXT,
  initials TEXT,
  summary TEXT,
  requester TEXT,
  requester_contact TEXT,
  delivery TEXT,
  text TEXT NOT NULL,
  filename TEXT,
  hints TEXT,
  response_type TEXT,
  answered_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pytania (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wniosek_id INTEGER NOT NULL REFERENCES wnioski(id) ON DELETE CASCADE,
  no INTEGER NOT NULL,
  text TEXT NOT NULL,
  departments TEXT NOT NULL DEFAULT '[]',
  suggestions TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS odpowiedzi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wniosek_id INTEGER NOT NULL REFERENCES wnioski(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  filename TEXT,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projekty (
  wniosek_id INTEGER PRIMARY KEY REFERENCES wnioski(id) ON DELETE CASCADE,
  draft TEXT NOT NULL,
  entities TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS dokumenty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  number TEXT,
  date TEXT,
  departments TEXT NOT NULL DEFAULT '[]',
  question TEXT,
  answer TEXT,
  text TEXT NOT NULL,
  filename TEXT,
  source_wniosek_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS historia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wniosek_id INTEGER NOT NULL REFERENCES wnioski(id) ON DELETE CASCADE,
  at TEXT DEFAULT (datetime('now','localtime')),
  action TEXT NOT NULL,
  details TEXT
);
`);

export const J = (s, d = null) => {
  try { return s ? JSON.parse(s) : d; } catch { return d; }
};

export function log(wniosekId, action, details) {
  db.prepare('INSERT INTO historia (wniosek_id, action, details) VALUES (?, ?, ?)').run(wniosekId, action, details ? String(details) : null);
}
