import path from 'node:path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { AppUser, DealColumnRow, DealRow, JsonRecord, OAuthClient, OAuthCodeRecord, OAuthTokenRecord } from './types';

const projectRoot = path.resolve(__dirname, '..');
export const dbPath = process.env.DATABASE_PATH ?? path.join(projectRoot, 'deals.db');
export const db = new Database(dbPath);

db.prepare(`CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  userId TEXT,
  label TEXT,
  input TEXT NOT NULL,
  analysis TEXT NOT NULL,
  createdAt TEXT NOT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  googleId TEXT UNIQUE,
  email TEXT UNIQUE,
  displayName TEXT
)`).run();

// Migrate users table
const userColumns = db.prepare('PRAGMA table_info(users)').all() as DealColumnRow[];
if (!userColumns.find(c => c.name === 'stripeCustomerId')) {
  db.prepare('ALTER TABLE users ADD COLUMN stripeCustomerId TEXT').run();
}
if (!userColumns.find(c => c.name === 'subscriptionStatus')) {
  db.prepare("ALTER TABLE users ADD COLUMN subscriptionStatus TEXT NOT NULL DEFAULT 'free'").run();
}

const dealColumns = db.prepare('PRAGMA table_info(deals)').all() as DealColumnRow[];
if (!dealColumns.find(c => c.name === 'userId')) {
  db.prepare('ALTER TABLE deals ADD COLUMN userId TEXT').run();
}

db.prepare(`CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS oauth_tokens (
  token TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  expires_at INTEGER
)`).run();

db.prepare('DELETE FROM oauth_tokens WHERE expires_at IS NOT NULL AND expires_at < ?').run(Date.now());

// OAuth client store
function dbGetClient(clientId: string): OAuthClient | undefined {
  const row = db.prepare('SELECT data FROM oauth_clients WHERE client_id = ?').get(clientId) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : undefined;
}
function dbSetClient(clientId: string, client: OAuthClient) {
  db.prepare('INSERT OR REPLACE INTO oauth_clients (client_id, data) VALUES (?, ?)').run(clientId, JSON.stringify(client));
}

// OAuth token store
function dbGetToken(token: string, type: string): OAuthCodeRecord | OAuthTokenRecord | undefined {
  const row = db.prepare('SELECT data, expires_at FROM oauth_tokens WHERE token = ? AND type = ?').get(token, type) as { data: string; expires_at: number | null } | undefined;
  if (!row) return undefined;
  if (row.expires_at && row.expires_at < Date.now()) { db.prepare('DELETE FROM oauth_tokens WHERE token = ?').run(token); return undefined; }
  return JSON.parse(row.data);
}
function dbSetToken(token: string, type: string, data: OAuthCodeRecord | OAuthTokenRecord, expiresAt?: number) {
  db.prepare('INSERT OR REPLACE INTO oauth_tokens (token, type, data, expires_at) VALUES (?, ?, ?, ?)').run(token, type, JSON.stringify(data), expiresAt ?? null);
}
function dbDeleteToken(token: string) {
  db.prepare('DELETE FROM oauth_tokens WHERE token = ?').run(token);
}

export const oauthClients = {
  get: (id: string) => dbGetClient(id),
  set: (id: string, c: OAuthClient) => dbSetClient(id, c),
  has: (id: string) => !!dbGetClient(id),
};
export const oauthCodes = {
  get: (token: string) => dbGetToken(token, 'code') as OAuthCodeRecord | undefined,
  set: (token: string, data: OAuthCodeRecord) => dbSetToken(token, 'code', data, data.expiresAt),
  delete: (token: string) => dbDeleteToken(token),
};
export const oauthAccessTokens = {
  get: (token: string) => dbGetToken(token, 'access') as OAuthTokenRecord | undefined,
  set: (token: string, data: OAuthTokenRecord) => dbSetToken(token, 'access', data, data.expiresAt),
};
export const oauthRefreshTokens = {
  get: (token: string) => dbGetToken(token, 'refresh') as OAuthTokenRecord | undefined,
  set: (token: string, data: OAuthTokenRecord) => dbSetToken(token, 'refresh', data),
};

// User helpers
export function getUserById(id: string): AppUser | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as AppUser | undefined) || null;
}

export function createUser(googleId: string, email: string | null, displayName: string): AppUser {
  let user = db.prepare('SELECT * FROM users WHERE googleId = ?').get(googleId) as AppUser | undefined;
  if (!user) {
    user = { id: uuidv4(), googleId, email, displayName };
    db.prepare('INSERT INTO users (id, googleId, email, displayName) VALUES (?, ?, ?, ?)').run(user.id, user.googleId, user.email, user.displayName);
  } else {
    db.prepare('UPDATE users SET email = ?, displayName = ? WHERE id = ?').run(email, displayName, user.id);
    user.email = email;
    user.displayName = displayName;
  }
  return user;
}

// Deal helpers
export function findDuplicateDeal(input: JsonRecord, userId: string | null): string | null {
  if (!userId) return null;
  const rows = db.prepare('SELECT id, input FROM deals WHERE userId = ?').all(userId) as { id: string; input: string }[];
  const sourceUrl = String(input.sourceUrl || input.url || '').trim().replace(/[?#].*$/, '');
  const address = String(input.address || '').trim().toLowerCase();
  const price = Number(input.price || 0);
  for (const row of rows) {
    const saved = JSON.parse(row.input) as JsonRecord;
    const savedUrl = String(saved.sourceUrl || saved.url || '').trim().replace(/[?#].*$/, '');
    if (sourceUrl && savedUrl && sourceUrl === savedUrl) return row.id;
    const savedAddress = String(saved.address || '').trim().toLowerCase();
    const savedPrice = Number(saved.price || 0);
    if (address && savedAddress && address === savedAddress && price && savedPrice && price === savedPrice) return row.id;
  }
  return null;
}

export function saveDealRecord(input: JsonRecord, analysis: JsonRecord, userId: string | null = null) {
  const existingId = findDuplicateDeal(input, userId);
  if (existingId) {
    db.prepare('UPDATE deals SET label = ?, input = ?, analysis = ?, createdAt = ? WHERE id = ?').run(
      input.label || input.address || 'Deal',
      JSON.stringify(input), JSON.stringify(analysis), new Date().toISOString(), existingId
    );
    return existingId;
  }
  const id = uuidv4();
  db.prepare('INSERT INTO deals (id, userId, label, input, analysis, createdAt) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, userId, input.label || input.address || 'Deal',
    JSON.stringify(input), JSON.stringify(analysis), new Date().toISOString()
  );
  return id;
}

export function isProUser(userId: string): boolean {
  const row = db.prepare("SELECT subscriptionStatus FROM users WHERE id = ?").get(userId) as { subscriptionStatus: string } | undefined;
  return row?.subscriptionStatus === 'pro';
}

export function countDeals(userId: string): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM deals WHERE userId = ?').get(userId) as { c: number };
  return row.c;
}

export function setSubscription(userId: string, status: 'free' | 'pro', stripeCustomerId?: string) {
  if (stripeCustomerId) {
    db.prepare('UPDATE users SET subscriptionStatus = ?, stripeCustomerId = ? WHERE id = ?').run(status, stripeCustomerId, userId);
  } else {
    db.prepare('UPDATE users SET subscriptionStatus = ? WHERE id = ?').run(status, userId);
  }
}

export function getUserByStripeCustomer(stripeCustomerId: string): AppUser | null {
  return (db.prepare('SELECT * FROM users WHERE stripeCustomerId = ?').get(stripeCustomerId) as AppUser | undefined) || null;
}

export function getSavedDeals(userId: string | null = null) {
  const rows = (userId
    ? db.prepare('SELECT * FROM deals WHERE userId = ? ORDER BY createdAt DESC').all(userId)
    : db.prepare('SELECT * FROM deals WHERE userId IS NULL ORDER BY createdAt DESC').all()) as DealRow[];

  return rows.flatMap(row => {
    try {
      return [{ id: row.id, userId: row.userId, label: row.label, createdAt: row.createdAt, input: JSON.parse(row.input), analysis: JSON.parse(row.analysis) }];
    } catch {
      return [{ id: row.id, userId: row.userId, label: row.label, createdAt: row.createdAt, input: {}, analysis: { _parseError: true } }];
    }
  });
}
