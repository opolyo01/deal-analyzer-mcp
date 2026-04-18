import path from 'node:path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

type JsonRecord = Record<string, any>;

interface DealRow {
  id: string;
  label: string;
  input: string;
  analysis: string;
  createdAt: string;
}

const dbPath = process.env.DATABASE_PATH ?? path.join(path.resolve(__dirname, '..'), 'deals.db');
const db = new Database(dbPath);

db.prepare(`
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  label TEXT,
  input TEXT,
  analysis TEXT,
  createdAt TEXT
)
`).run();

export function saveDeal(input: JsonRecord, analysis: JsonRecord) {
  const id = uuidv4();

  db.prepare(`
    INSERT INTO deals (id, label, input, analysis, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    input.label || 'Deal',
    JSON.stringify(input),
    JSON.stringify(analysis),
    new Date().toISOString()
  );

  return id;
}

export function getDeals() {
  return (db.prepare('SELECT * FROM deals ORDER BY createdAt DESC').all() as DealRow[])
    .map(r => ({
      ...r,
      input: JSON.parse(r.input),
      analysis: JSON.parse(r.analysis)
    }));
}
