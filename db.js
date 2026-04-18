const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const db = new Database('deals.db');

db.prepare(`
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  label TEXT,
  input TEXT,
  analysis TEXT,
  createdAt TEXT
)
`).run();

function saveDeal(input, analysis) {
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

function getDeals() {
  return db.prepare('SELECT * FROM deals ORDER BY createdAt DESC').all()
    .map(r => ({
      ...r,
      input: JSON.parse(r.input),
      analysis: JSON.parse(r.analysis)
    }));
}

module.exports = { saveDeal, getDeals };