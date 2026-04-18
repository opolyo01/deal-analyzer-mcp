const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json({ limit: '1mb' }));

// 🔥 SERVE UI FILES
app.use(express.static(path.join(__dirname, 'public')));

const APP_NAME = 'deal-analyzer-mcp';
const APP_VERSION = '1.6.0';
const DEFAULT_RATE = Number(process.env.DEFAULT_RATE || 0.065);
const DEFAULT_TERM_YEARS = Number(process.env.DEFAULT_TERM_YEARS || 30);
const DEFAULT_VACANCY_RATE = Number(process.env.DEFAULT_VACANCY_RATE || 0.05);
const DEFAULT_REPAIRS_RATE = Number(process.env.DEFAULT_REPAIRS_RATE || 0.05);
const DEFAULT_CAPEX_RATE = Number(process.env.DEFAULT_CAPEX_RATE || 0.05);
const DEFAULT_MANAGEMENT_RATE = Number(process.env.DEFAULT_MANAGEMENT_RATE || 0.08);
const PORT = Number(process.env.PORT || 3000);
const widgetPath = path.join(__dirname, 'public', 'deal-widget.html');
const dashboardPath = path.join(__dirname, 'dashboard.html');

// ================= DATABASE =================
const db = new Database(path.join(__dirname, 'deals.db'));
db.prepare(`
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  label TEXT,
  input TEXT NOT NULL,
  analysis TEXT NOT NULL,
  createdAt TEXT NOT NULL
)
`).run();

function saveDealRecord(input, analysis) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO deals (id, label, input, analysis, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    input.label || input.address || 'Deal',
    JSON.stringify(input),
    JSON.stringify(analysis),
    new Date().toISOString()
  );
  return id;
}

function getSavedDeals() {
  return db.prepare('SELECT * FROM deals ORDER BY createdAt DESC').all().map(row => ({
    id: row.id,
    label: row.label,
    createdAt: row.createdAt,
    input: JSON.parse(row.input),
    analysis: JSON.parse(row.analysis)
  }));
}

// (rest unchanged)

app.listen(PORT, () => {
  console.log(`${APP_NAME} listening on port ${PORT}`);
});