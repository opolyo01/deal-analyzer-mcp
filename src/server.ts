import 'dotenv/config';
import express, { type Request } from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'node:crypto';

type JsonRecord = Record<string, any>;

interface AppUser {
  id: string;
  googleId?: string | null;
  email?: string | null;
  displayName?: string | null;
}

interface DealColumnRow {
  name: string;
}

interface DealRow {
  id: string;
  userId: string | null;
  label: string;
  input: string;
  analysis: string;
  createdAt: string;
}

interface OAuthClient {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
  scope: string;
  client_name?: string;
}

interface OAuthCodeRecord {
  client_id: string;
  redirect_uri: string;
  userId: string;
  scope: string;
  code_challenge: string;
  expiresAt: number;
}

interface OAuthTokenRecord {
  userId: string;
  client_id: string;
  scope: string;
  expiresAt?: number;
}

declare global {
  namespace Express {
    interface User extends AppUser {}
  }
}

declare module 'express-session' {
  interface SessionData {
    returnTo?: string;
  }
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
const projectRoot = path.resolve(__dirname, '..');
app.use(express.static(path.join(projectRoot, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto' }
}));
app.use(passport.initialize());
app.use(passport.session());

const APP_NAME = 'deal-analyzer-mcp';
const APP_VERSION = '1.9.0';
const DEFAULT_RATE = Number(process.env.DEFAULT_RATE || 0.065);
const DEFAULT_TERM_YEARS = Number(process.env.DEFAULT_TERM_YEARS || 30);
const DEFAULT_VACANCY_RATE = Number(process.env.DEFAULT_VACANCY_RATE || 0.05);
const DEFAULT_REPAIRS_RATE = Number(process.env.DEFAULT_REPAIRS_RATE || 0.05);
const DEFAULT_CAPEX_RATE = Number(process.env.DEFAULT_CAPEX_RATE || 0.05);
const DEFAULT_MANAGEMENT_RATE = Number(process.env.DEFAULT_MANAGEMENT_RATE || 0.08);
const DEFAULT_PROPERTY_TAX_RATE = Number(process.env.DEFAULT_PROPERTY_TAX_RATE || 0.011);
const DEFAULT_INSURANCE_RATE = Number(process.env.DEFAULT_INSURANCE_RATE || 0.0035);
const PORT = Number(process.env.PORT || 3000);
const dashboardPath = path.join(projectRoot, 'dashboard.html');
const PUBLIC_BASE_URL = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || (PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/auth/google/callback` : '/auth/google/callback');
const isLocalOrigin = !PUBLIC_BASE_URL || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(PUBLIC_BASE_URL);
const ALLOW_ANONYMOUS_MODE = process.env.ALLOW_ANONYMOUS_MODE === 'true' && isLocalOrigin;
const AGENT_CONFIG = {
  name: process.env.AGENT_NAME || '',
  photo: process.env.AGENT_PHOTO_URL || '',
  brokerage: process.env.AGENT_BROKERAGE || '',
  phone: process.env.AGENT_PHONE || '',
  email: process.env.AGENT_EMAIL || '',
  bio: process.env.AGENT_BIO || '',
  zillowUrl: process.env.AGENT_ZILLOW_URL || '',
  licenseNumber: process.env.AGENT_LICENSE || '',
};

const STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]);
const PROPERTY_TAX_RATE_BY_STATE: JsonRecord = {
  AL: 0.004, AK: 0.010, AZ: 0.006, AR: 0.006, CA: 0.0075, CO: 0.005, CT: 0.019, DE: 0.006, FL: 0.009, GA: 0.009,
  HI: 0.003, ID: 0.007, IL: 0.020, IN: 0.0085, IA: 0.015, KS: 0.013, KY: 0.008, LA: 0.006, ME: 0.013, MD: 0.010,
  MA: 0.011, MI: 0.015, MN: 0.011, MS: 0.007, MO: 0.010, MT: 0.008, NE: 0.016, NV: 0.006, NH: 0.018, NJ: 0.023,
  NM: 0.007, NY: 0.016, NC: 0.008, ND: 0.009, OH: 0.015, OK: 0.009, OR: 0.009, PA: 0.014, RI: 0.015, SC: 0.006,
  SD: 0.012, TN: 0.006, TX: 0.016, UT: 0.006, VT: 0.018, VA: 0.008, WA: 0.009, WV: 0.006, WI: 0.017, WY: 0.006, DC: 0.006
};
const INSURANCE_STATE_MULTIPLIER: JsonRecord = {
  AL: 1.25, AK: 1.1, AZ: 0.95, AR: 1.25, CA: 1.25, CO: 1.35, CT: 1.05, DE: 1.0, FL: 2.25, GA: 1.15,
  HI: 1.15, ID: 0.9, IL: 1.0, IN: 1.0, IA: 1.1, KS: 1.25, KY: 1.05, LA: 1.9, ME: 0.95, MD: 1.0,
  MA: 1.05, MI: 1.05, MN: 1.15, MS: 1.35, MO: 1.15, MT: 1.05, NE: 1.25, NV: 0.95, NH: 0.95, NJ: 1.05,
  NM: 1.0, NY: 1.1, NC: 1.15, ND: 1.1, OH: 0.95, OK: 1.55, OR: 0.9, PA: 0.95, RI: 1.1, SC: 1.25,
  SD: 1.1, TN: 1.05, TX: 1.65, UT: 0.9, VT: 0.95, VA: 0.95, WA: 0.95, WV: 0.95, WI: 0.95, WY: 1.0, DC: 1.0
};
const RENT_STATE_MULTIPLIER: JsonRecord = {
  CA: 1.12, NY: 1.1, MA: 1.08, NJ: 1.06, WA: 1.05, DC: 1.12, CO: 1.04, FL: 1.03, TX: 1.02,
  IL: 1.0, PA: 0.96, OH: 0.92, MI: 0.92, IN: 0.9, WI: 0.92, MO: 0.9, AL: 0.88, MS: 0.86, WV: 0.84
};

const dbPath = process.env.DATABASE_PATH ?? path.join(projectRoot, 'deals.db');
const db = new Database(dbPath);
db.prepare(`
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  userId TEXT,
  label TEXT,
  input TEXT NOT NULL,
  analysis TEXT NOT NULL,
  createdAt TEXT NOT NULL
)
`).run();
db.prepare(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  googleId TEXT UNIQUE,
  email TEXT UNIQUE,
  displayName TEXT
)
`).run();

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

function dbGetClient(clientId: string): OAuthClient | undefined {
  const row = db.prepare('SELECT data FROM oauth_clients WHERE client_id = ?').get(clientId) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : undefined;
}
function dbSetClient(clientId: string, client: OAuthClient) {
  db.prepare('INSERT OR REPLACE INTO oauth_clients (client_id, data) VALUES (?, ?)').run(clientId, JSON.stringify(client));
}
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
db.prepare('DELETE FROM oauth_tokens WHERE expires_at IS NOT NULL AND expires_at < ?').run(Date.now());

function configuredSecret(value: string | undefined) {
  if (!value) return false;
  return !['replace-with-', 'paste-your-', 'your-real-', 'your-client-', 'your-secret'].some(prefix => value.startsWith(prefix));
}

function normalizeBaseUrl(value: string | undefined) {
  return value ? value.replace(/\/+$/, '') : '';
}

const googleAuthConfigured = configuredSecret(process.env.GOOGLE_CLIENT_ID) && configuredSecret(process.env.GOOGLE_CLIENT_SECRET);
if (googleAuthConfigured) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: GOOGLE_CALLBACK_URL
  }, (accessToken, refreshToken, profile, done) => {
    try {
      let user = db.prepare('SELECT * FROM users WHERE googleId = ?').get(profile.id) as AppUser | undefined;
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      const displayName = profile.displayName || email || 'User';

      if (!user) {
        user = {
          id: uuidv4(),
          googleId: profile.id,
          email,
          displayName
        };
        db.prepare('INSERT INTO users (id, googleId, email, displayName) VALUES (?, ?, ?, ?)').run(user.id, user.googleId, user.email, user.displayName);
      } else {
        db.prepare('UPDATE users SET email = ?, displayName = ? WHERE id = ?').run(email, displayName, user.id);
        user.email = email;
        user.displayName = displayName;
      }

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));
}
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(String(id)) as AppUser | undefined;
    done(null, user || null);
  } catch (error) {
    done(error);
  }
});

const oauthClients = {
  get: (id: string) => dbGetClient(id),
  set: (id: string, c: OAuthClient) => dbSetClient(id, c),
  has: (id: string) => !!dbGetClient(id),
};
const oauthCodes = {
  get: (token: string) => dbGetToken(token, 'code') as OAuthCodeRecord | undefined,
  set: (token: string, data: OAuthCodeRecord) => dbSetToken(token, 'code', data, data.expiresAt),
  delete: (token: string) => dbDeleteToken(token),
};
const oauthAccessTokens = {
  get: (token: string) => dbGetToken(token, 'access') as OAuthTokenRecord | undefined,
  set: (token: string, data: OAuthTokenRecord) => dbSetToken(token, 'access', data, data.expiresAt),
};
const oauthRefreshTokens = {
  get: (token: string) => dbGetToken(token, 'refresh') as OAuthTokenRecord | undefined,
  set: (token: string, data: OAuthTokenRecord) => dbSetToken(token, 'refresh', data),
};

function baseUrl(req: Request) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  return `${req.protocol}://${req.get('host')}`;
}
function queryParam(value: unknown) {
  if (Array.isArray(value)) return queryParam(value[0]);
  return typeof value === 'string' ? value : '';
}
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
function sha256base64url(input: string) {
  return crypto.createHash('sha256').update(input).digest('base64url');
}
function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function getUserById(id: string): AppUser | null {
  return (db.prepare('SELECT * FROM users WHERE id = ?').get(id) as AppUser | undefined) || null;
}
function saveDealRecord(input: JsonRecord, analysis: JsonRecord, userId: string | null = null) {
  const id = uuidv4();
  db.prepare(`INSERT INTO deals (id, userId, label, input, analysis, createdAt) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id,
    userId,
    input.label || input.address || 'Deal',
    JSON.stringify(input),
    JSON.stringify(analysis),
    new Date().toISOString()
  );
  return id;
}
function getSavedDeals(userId: string | null = null) {
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
function currentUser(req: Request): AppUser | null {
  return req.user || null;
}
function bearerUser(req: Request): AppUser | null {
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length);
  const tokenRow = oauthAccessTokens.get(token);
  if (!tokenRow || (tokenRow.expiresAt ?? 0) < Date.now()) return null;
  return getUserById(tokenRow.userId);
}
function sessionOrBearerUser(req: Request): AppUser | null {
  return currentUser(req) || bearerUser(req);
}


function round(value: number, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function annualToMonthly(value: number) {
  return Number(value || 0) / 12;
}
function asCurrency(value: number) {
  const sign = value < 0 ? '-' : '';
  const amount = Math.abs(Math.round(value || 0));
  return `${sign}$${amount.toLocaleString('en-US')}`;
}
function roundToNearest(value: number, step = 25) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}
function calculateMortgagePayment(principal: number, annualRate: number, termYears: number) {
  if (!principal || principal <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const numberOfPayments = termYears * 12;
  if (!monthlyRate) return principal / numberOfPayments;
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
}
function hasInputValue(value: unknown) {
  return value != null && value !== '';
}
function normalizeStateCode(value: unknown) {
  if (typeof value !== 'string') return '';
  const code = value.trim().toUpperCase();
  return STATE_CODES.has(code) ? code : '';
}
function inferLocation(input: JsonRecord = {}) {
  const explicitState = normalizeStateCode(input.state);
  const address = String(input.address || input.label || '').trim();
  const sourceUrl = String(input.sourceUrl || input.url || '').trim();
  let city = typeof input.city === 'string' ? input.city.trim() : '';
  let state = explicitState;
  let confidence = state ? 'medium' : 'low';

  const addressMatch = address.match(/,\s*([^,]+),\s*([A-Z]{2})(?:\s+\d{5})?\b/);
  if (!state && addressMatch) {
    state = normalizeStateCode(addressMatch[2]);
    city = city || addressMatch[1].trim();
    confidence = state ? 'medium' : confidence;
  }
  const redfinMatch = sourceUrl.match(/\/([A-Z]{2})\/([^/?#]+)/);
  if (!state && redfinMatch) {
    state = normalizeStateCode(redfinMatch[1]);
    city = city || decodeURIComponent(redfinMatch[2]).replace(/-/g, ' ');
    confidence = state ? 'medium' : confidence;
  }
  const zillowMatch = sourceUrl.match(/-([A-Za-z-]+)-([A-Z]{2})-\d{5}/);
  if (!state && zillowMatch) {
    state = normalizeStateCode(zillowMatch[2]);
    city = city || zillowMatch[1].replace(/-/g, ' ');
    confidence = state ? 'medium' : confidence;
  }
  return { city, state, confidence };
}
function propertyKind(propertyType = '') {
  const kind = String(propertyType || '').toLowerCase();
  if (kind.includes('condo') || kind.includes('condominium')) return 'condo';
  if (kind.includes('townhouse') || kind.includes('townhome')) return 'townhouse';
  if (kind.includes('duplex') || kind.includes('triplex') || kind.includes('quad') || kind.includes('multi')) return 'multifamily';
  return 'singleFamily';
}
function parseDownPayment(input: JsonRecord, price: number) {
  if (input.downPaymentAmount != null) return Number(input.downPaymentAmount);
  if (input.downPaymentPercent != null) return price * Number(input.downPaymentPercent);
  if (input.downPayment != null) {
    const value = Number(input.downPayment);
    return value <= 1 ? price * value : value;
  }
  return price * 0.2;
}
function estimateRent(price: number, propertyType = '', location: JsonRecord = {}) {
  if (!price) return { rent: 0, low: 0, high: 0, estimated: true, confidence: 'low', method: 'price-rent heuristic', compsUsed: 0 };
  const kind = String(propertyType || '').toLowerCase();
  let ratio = 0.006;
  if (price < 300000) ratio = 0.008;
  if (price > 800000) ratio = 0.005;
  if (kind.includes('multi') || kind.includes('duplex') || kind.includes('triplex') || kind.includes('quad')) ratio += 0.001;
  if (kind.includes('condo')) ratio -= 0.0005;
  const stateMultiplier = location.state ? (RENT_STATE_MULTIPLIER[location.state] ?? 1) : 1;
  const rent = roundToNearest(price * ratio * stateMultiplier, 25);
  return {
    rent,
    low: roundToNearest(rent * 0.88, 25),
    high: roundToNearest(rent * 1.12, 25),
    estimated: true,
    confidence: price >= 250000 && price <= 900000 ? (location.state ? 'medium' : 'low') : 'low',
    method: 'price-rent heuristic',
    compsUsed: 0,
    location
  };
}
function normalizeRentComps(input: JsonRecord = {}) {
  const raw = Array.isArray(input.rentComps) ? input.rentComps : [];
  return raw.flatMap((comp: JsonRecord) => {
    const rent = Number(comp?.rent || comp?.monthlyRent || 0);
    if (!Number.isFinite(rent) || rent <= 0) return [];
    return [{
      rent,
      beds: comp.beds != null ? Number(comp.beds) : null,
      baths: comp.baths != null ? Number(comp.baths) : null,
      sqft: comp.sqft != null ? Number(comp.sqft) : null,
      distanceMiles: comp.distanceMiles != null ? Number(comp.distanceMiles) : null,
      source: comp.source || '',
      address: comp.address || ''
    }];
  });
}
function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * p));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower));
}
function estimateMarketRent(input: JsonRecord = {}, location: JsonRecord = {}) {
  const priceEstimate = estimateRent(Number(input.price || 0), input.propertyType, location);
  const comps = normalizeRentComps(input);
  if (comps.length) {
    const rents = comps.map(comp => comp.rent);
    const rent = roundToNearest(percentile(rents, 0.5), 25);
    return {
      rent,
      low: roundToNearest(percentile(rents, 0.25), 25),
      high: roundToNearest(percentile(rents, 0.75), 25),
      estimated: true,
      confidence: comps.length >= 3 ? 'medium' : 'low',
      method: 'provided rent comps',
      compsUsed: comps.length,
      comps: comps.slice(0, 8),
      priceEstimate,
      location
    };
  }
  return priceEstimate;
}
function estimatePropertyTaxes(price: number, location: JsonRecord = {}) {
  if (!price || price <= 0) return null;
  const state = normalizeStateCode(location.state);
  const rate = state ? (PROPERTY_TAX_RATE_BY_STATE[state] ?? DEFAULT_PROPERTY_TAX_RATE) : DEFAULT_PROPERTY_TAX_RATE;
  const annual = roundToNearest(price * rate, 50);
  return {
    annual,
    monthly: round(annual / 12),
    rate,
    state: state || null,
    confidence: state ? 'medium' : 'low',
    method: state ? 'state effective-rate heuristic' : 'default national heuristic'
  };
}
function estimateInsurance(price: number, propertyType = '', location: JsonRecord = {}) {
  if (!price || price <= 0) return null;
  const kind = propertyKind(propertyType);
  const profile: JsonRecord = {
    condo: { rate: 0.0018, minimum: 650 },
    townhouse: { rate: 0.0025, minimum: 900 },
    multifamily: { rate: 0.0045, minimum: 1600 },
    singleFamily: { rate: DEFAULT_INSURANCE_RATE, minimum: 1100 }
  }[kind];
  const state = normalizeStateCode(location.state);
  const multiplier = state ? (INSURANCE_STATE_MULTIPLIER[state] ?? 1) : 1;
  const annual = roundToNearest(Math.max(profile.minimum, price * profile.rate * multiplier), 25);
  return {
    annual,
    monthly: round(annual / 12),
    rate: profile.rate,
    stateMultiplier: multiplier,
    propertyType: kind,
    state: state || null,
    confidence: state && propertyType ? 'medium' : 'low',
    method: 'property-type insurance heuristic'
  };
}
function propertyTypeUsuallyHasHoa(propertyType = '') {
  const kind = String(propertyType || '').toLowerCase();
  return kind.includes('condo') || kind.includes('townhome') || kind.includes('townhouse');
}
function normalizeDealInput(input: JsonRecord = {}) {
  const price = Number(input.price || 0);
  const propertyType = input.propertyType || '';
  const location = inferLocation(input);
  const rentProvided = hasInputValue(input.rent);
  const taxesProvided = hasInputValue(input.taxes);
  const insuranceProvided = hasInputValue(input.insurance);
  const hoaProvided = hasInputValue(input.hoa);
  const marketRentEstimate = estimateMarketRent({ ...input, price, propertyType }, location);
  const taxEstimate = taxesProvided ? null : estimatePropertyTaxes(price, location);
  const insuranceEstimate = insuranceProvided ? null : estimateInsurance(price, propertyType, location);
  let rentEstimate: ReturnType<typeof estimateMarketRent> | null = null;
  let rent = Number(input.rent || 0);
  if (!rentProvided) {
    rentEstimate = marketRentEstimate;
    rent = rentEstimate.rent;
  }
  const downPaymentAmount = parseDownPayment(input, price);
  return {
    label: input.label || input.address || input.sourceUrl || '',
    address: input.address || '',
    sourceUrl: input.sourceUrl || input.url || '',
    location,
    price,
    rent,
    rentProvided,
    estimatedRent: !rentProvided,
    estimatedRentConfidence: rentEstimate ? rentEstimate.confidence : null,
    marketRent: marketRentEstimate,
    taxes: taxesProvided ? Number(input.taxes) : (taxEstimate ? taxEstimate.annual : 0),
    insurance: insuranceProvided ? Number(input.insurance) : (insuranceEstimate ? insuranceEstimate.annual : 0),
    hoa: hoaProvided ? Number(input.hoa) : 0,
    taxesProvided,
    insuranceProvided,
    hoaProvided,
    taxesEstimated: !taxesProvided && !!taxEstimate,
    insuranceEstimated: !insuranceProvided && !!insuranceEstimate,
    taxEstimate,
    insuranceEstimate,
    otherMonthlyCosts: Number(input.otherMonthlyCosts || 0),
    rate: input.rate != null ? Number(input.rate) : DEFAULT_RATE,
    termYears: input.termYears != null ? Number(input.termYears) : DEFAULT_TERM_YEARS,
    downPaymentAmount,
    downPaymentPercent: price > 0 ? downPaymentAmount / price : 0,
    vacancyRate: input.vacancyRate != null ? Number(input.vacancyRate) : DEFAULT_VACANCY_RATE,
    repairsRate: input.repairsRate != null ? Number(input.repairsRate) : DEFAULT_REPAIRS_RATE,
    capexRate: input.capexRate != null ? Number(input.capexRate) : DEFAULT_CAPEX_RATE,
    managementRate: input.managementRate != null ? Number(input.managementRate) : DEFAULT_MANAGEMENT_RATE,
    propertyType,
    beds: input.beds != null ? Number(input.beds) : null,
    baths: input.baths != null ? Number(input.baths) : null,
    sqft: input.sqft != null ? Number(input.sqft) : null
  };
}
function calculateDeal(rawInput: JsonRecord = {}) {
  const input = normalizeDealInput(rawInput);
  const loanAmount = Math.max(input.price - input.downPaymentAmount, 0);
  const monthlyMortgage = calculateMortgagePayment(loanAmount, input.rate, input.termYears);
  const monthlyInterest = loanAmount > 0 ? loanAmount * (input.rate / 12) : 0;
  const monthlyPrincipalPaydown = Math.max(monthlyMortgage - monthlyInterest, 0);
  const monthlyTaxes = annualToMonthly(input.taxes);
  const monthlyInsurance = annualToMonthly(input.insurance);
  const monthlyVacancy = input.rent * input.vacancyRate;
  const monthlyRepairs = input.rent * input.repairsRate;
  const monthlyCapex = input.rent * input.capexRate;
  const monthlyManagement = input.rent * input.managementRate;
  const monthlyOperatingExpense = monthlyTaxes + monthlyInsurance + input.hoa + input.otherMonthlyCosts + monthlyVacancy + monthlyRepairs + monthlyCapex + monthlyManagement;
  const monthlyAllInCost = monthlyMortgage + monthlyOperatingExpense;
  const monthlyCostBeforePrincipal = monthlyOperatingExpense + monthlyInterest;
  const monthlyCashFlow = input.rent - monthlyAllInCost;
  const monthlyCashFlowBeforePrincipal = input.rent - monthlyCostBeforePrincipal;
  const annualNOI = (input.rent * 12) - (monthlyOperatingExpense * 12);
  const annualDebtService = monthlyMortgage * 12;
  const capRate = input.price > 0 ? annualNOI / input.price : 0;
  const grossYield = input.price > 0 ? (input.rent * 12) / input.price : 0;
  const cashOnCashReturn = input.downPaymentAmount > 0 ? ((monthlyCashFlow * 12) / input.downPaymentAmount) : 0;
  const dscr = annualDebtService > 0 ? annualNOI / annualDebtService : 0;
  const breakEvenRent = monthlyAllInCost;

  let score = 5;
  const missingTaxes = !input.taxesProvided && !input.taxesEstimated;
  const missingInsurance = !input.insuranceProvided && !input.insuranceEstimated;
  const estimatedTaxes = input.taxesEstimated;
  const estimatedInsurance = input.insuranceEstimated;
  const estimatedCriticalExpense = estimatedTaxes || estimatedInsurance;
  const missingLikelyHoa = propertyTypeUsuallyHasHoa(input.propertyType) && !input.hoaProvided;
  if (monthlyCashFlow >= 500) score += 3;
  else if (monthlyCashFlow >= 200) score += 2;
  else if (monthlyCashFlow > 0) score += 1;
  else if (monthlyCashFlow <= -500) score -= 3;
  else if (monthlyCashFlow < 0) score -= 2;
  if (capRate >= 0.08) score += 2;
  else if (capRate >= 0.065) score += 1;
  else if (capRate < 0.045) score -= 1;
  if (cashOnCashReturn >= 0.10) score += 2;
  else if (cashOnCashReturn >= 0.06) score += 1;
  else if (cashOnCashReturn < 0) score -= 1;
  if (dscr >= 1.30) score += 1;
  else if (dscr > 0 && dscr < 1.0) score -= 1;
  if (input.downPaymentPercent >= 0.25) score += 1;
  if (missingTaxes) score -= 1;
  if (missingInsurance) score -= 1;
  if (missingLikelyHoa) score -= 1;
  if (input.estimatedRent && (missingTaxes || missingInsurance)) score = Math.min(score, 6);
  else if (missingTaxes || missingInsurance) score = Math.min(score, 7);
  if (input.estimatedRent && estimatedCriticalExpense) score = Math.min(score, 7);
  else if (estimatedCriticalExpense) score = Math.min(score, 8);
  if (missingLikelyHoa) score = Math.min(score, 6);
  score = clamp(score, 1, 10);

  let recommendation = 'HOLD';
  if (score >= 8) recommendation = 'BUY';
  else if (score <= 4) recommendation = 'PASS';

  const risks = [];
  const strengths = [];
  if (input.estimatedRent) risks.push(`Rent estimated with ${input.estimatedRentConfidence || 'low'} confidence`);
  if (monthlyCashFlow < 0) risks.push('Negative monthly cash flow at current assumptions');
  if (capRate < 0.05) risks.push('Cap rate is weak for a leveraged rental');
  if (cashOnCashReturn < 0.05) risks.push('Cash-on-cash return is modest');
  if (missingTaxes) risks.push('Property taxes are missing, so the model may be optimistic');
  else if (estimatedTaxes) risks.push(`Property taxes are estimated from ${input.taxEstimate?.state || 'default'} location assumptions; verify the actual tax bill`);
  else if (input.taxes === 0) risks.push('Property taxes are explicitly set to zero');
  if (missingInsurance) risks.push('Insurance is missing, so monthly cost may be understated');
  else if (estimatedInsurance) risks.push(`Insurance is estimated from property type and location; verify with a quote`);
  else if (input.insurance === 0) risks.push('Insurance is explicitly set to zero');
  if (missingLikelyHoa) risks.push('HOA is missing for a condo/townhome-style property, so monthly cost may be understated');
  if (input.rentProvided && input.marketRent?.high && input.rent > input.marketRent.high * 1.05) risks.push('Provided rent is above the model market-rent range; verify with current comps');
  if (dscr > 0 && dscr < 1.1) risks.push('Debt coverage is thin');
  if (monthlyCashFlow > 0) strengths.push('Positive projected monthly cash flow');
  if (capRate >= 0.06) strengths.push('Cap rate clears a basic rental threshold');
  if (cashOnCashReturn >= 0.08) strengths.push('Cash-on-cash return is healthy');
  if (dscr >= 1.25) strengths.push('Debt coverage looks healthy');
  if (input.downPaymentPercent >= 0.25) strengths.push('Higher down payment reduces financing pressure');

  return {
    input,
    summary: {
      monthlyCashFlow: round(monthlyCashFlow),
      capRate: round(capRate, 3),
      grossYield: round(grossYield, 3),
      cashOnCashReturn: round(cashOnCashReturn, 3),
      dscr: round(dscr, 2),
      score,
      recommendation,
      breakEvenRent: round(breakEvenRent),
      monthlyMortgage: round(monthlyMortgage),
      monthlyInterest: round(monthlyInterest),
      monthlyPrincipalPaydown: round(monthlyPrincipalPaydown),
      monthlyOperatingExpense: round(monthlyOperatingExpense),
      monthlyAllInCost: round(monthlyAllInCost),
      monthlyCostBeforePrincipal: round(monthlyCostBeforePrincipal),
      monthlyCashFlowBeforePrincipal: round(monthlyCashFlowBeforePrincipal),
      monthlyExpenseBreakdown: {
        mortgage: round(monthlyMortgage),
        debtPayment: round(monthlyMortgage),
        interest: round(monthlyInterest),
        principalPaydown: round(monthlyPrincipalPaydown),
        taxes: round(monthlyTaxes),
        insurance: round(monthlyInsurance),
        hoa: round(input.hoa),
        otherMonthlyCosts: round(input.otherMonthlyCosts),
        vacancy: round(monthlyVacancy),
        repairs: round(monthlyRepairs),
        capex: round(monthlyCapex),
        management: round(monthlyManagement)
      },
      missingInputs: {
        taxes: missingTaxes,
        insurance: missingInsurance,
        hoa: missingLikelyHoa
      },
      estimatedInputs: {
        rent: input.estimatedRent,
        taxes: estimatedTaxes,
        insurance: estimatedInsurance
      },
      marketRent: input.marketRent,
      estimatedRent: input.estimatedRent,
      estimatedRentConfidence: input.estimatedRentConfidence
    },
    assumptions: {
      rate: input.rate,
      termYears: input.termYears,
      downPaymentAmount: round(input.downPaymentAmount),
      downPaymentPercent: round(input.downPaymentPercent, 3),
      vacancyRate: input.vacancyRate,
      repairsRate: input.repairsRate,
      capexRate: input.capexRate,
      managementRate: input.managementRate,
      location: input.location,
      taxEstimate: input.taxEstimate,
      insuranceEstimate: input.insuranceEstimate
    },
    strengths,
    risks
  };
}
function tryParseJson(value: string) {
  try { return JSON.parse(value); } catch { return null; }
}
function extractMoney(text: unknown, allowSmallBare = false) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/(\$)?\s*([\d,]+)(?:\.\d{2})?/);
  if (!match) return null;
  const digits = match[2].replace(/,/g, '');
  if (!match[1] && !allowSmallBare && digits.length < 4) return null;
  return Number(digits);
}
function hasRentContext(text: string) {
  return /\b(rent|rental|lease)\b/i.test(text);
}
function hasNonRentMonthlyCostContext(text: string) {
  return /\b(hoa|dues?|association|condo\s+fee|mortgage|payment|principal|interest|tax(?:es)?|insurance|piti|assessment)\b/i.test(text);
}
function normalizePropertyType(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('single') || s === 'house' || s === 'sfr') return 'Single family';
  if (s.includes('condo') || s.includes('condominium')) return 'Condo';
  if (s.includes('townhouse') || s.includes('townhome')) return 'Townhouse';
  if (s.includes('duplex')) return 'Duplex';
  if (s.includes('triplex')) return 'Triplex';
  if (s.includes('multi') || s.includes('apartment') || s.includes('mf')) return 'Multifamily';
  return raw;
}
function walkForNumbers(node: unknown, out: JsonRecord, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) return node.forEach(item => walkForNumbers(item, out, depth + 1));
  for (const [key, value] of Object.entries(node)) {
    const k = key.toLowerCase();
    if (typeof value === 'number' && value > 0) {
      if (out.price == null && /listprice|listingprice|askingprice|saleprice|sellingprice|^price$|unformattedprice/.test(k)) out.price = value;
      if (out.rent == null && /rent|rentalestimate|zestimate.*rent/.test(k)) out.rent = value;
      if (out.taxes == null && /taxannual|annualtax|propertytax|taxamount|taxesamount|realestatetax|annualtaxamount|taxesdueannual/.test(k)) out.taxes = value;
      if (out.hoa == null && /hoafee|hoamonthly|hoamonth|hoaamt|hoadues|hoadue|associationfee|condofee|^hoa$/.test(k)) out.hoa = value;
      if (out.beds == null && /^bed|bedroom/.test(k)) out.beds = value;
      if (out.baths == null && /^bath|bathroom/.test(k)) out.baths = value;
      if (out.sqft == null && /sqft|squarefeet|floorarea|livingarea|finishedsqft/.test(k)) out.sqft = value;
    } else if (typeof value === 'string' && value.length < 300) {
      const addressMatch = value.match(/\d+ .+, [A-Za-z .'-]+, [A-Z]{2} \d{5}/);
      if (!out.address && addressMatch) out.address = addressMatch[0];
      if (!out.propertyType && /propertytype|hometype|^type$|propertystyle/.test(k)) out.propertyType = normalizePropertyType(value);
      const money = extractMoney(value, /hoa|associationfee|condofee/.test(k));
      if (money != null && money > 0) {
        if (out.price == null && /listprice|listingprice|price|amount/.test(k)) out.price = money;
        if (out.rent == null && /rent/.test(k)) out.rent = money;
        if (out.taxes == null && /tax/.test(k)) out.taxes = money;
        if (out.hoa == null && /hoa|associationfee|condofee/.test(k)) out.hoa = money;
      }
    }
    walkForNumbers(value, out, depth + 1);
  }
}
function parseListingText(text: unknown, sourceUrl = ''): JsonRecord {
  const bodyText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!bodyText) return {};
  const result: JsonRecord = { sourceUrl, address: '', propertyType: '', price: null, rent: null, taxes: null, hoa: null, insurance: null, beds: null, baths: null, sqft: null, parserNotes: [] };
  const addressMatch = bodyText.match(/\d{1,6}\s+[A-Za-z0-9.'\- ]+,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5}/);
  if (addressMatch) result.address = addressMatch[0].trim();
  const propertyTypeMatch = bodyText.match(/\b(single[\s-]family|multifamily|multi[\s-]family|duplex|triplex|quadruplex|condo(?:minium)?|townhome|townhouse|apartment)\b/i);
  if (propertyTypeMatch) result.propertyType = normalizePropertyType(propertyTypeMatch[1]);
  // Price: listing price first, then sold/sales history, then largest dollar amount
  for (const pattern of [
    /(?:list(?:ing)?\s+price|listed\s+for|asking\s+price|price)\s*:?\s*(\$[\d,]+)/i,
    /(?:sold\s+for|sale\s+price|last\s+sold)\s*:?\s*(\$[\d,]+)/i,
    /(\$[\d,]{5,})/
  ]) {
    const match = bodyText.match(pattern);
    if (match) { result.price = extractMoney(match[1]); break; }
  }
  // HOA — parse before rent so the greedy $X/mo rent fallback doesn't steal HOA amounts
  const hoaMatch = bodyText.match(/hoa(?:\s+(?:fee|dues|due))?\s*:?\s*(\$[\d,]+)\s*(?:\/\s*mo(?:nth)?)?/i)
    || bodyText.match(/(\$[\d,]+)\s*(?:\/\s*mo[a-z]*)?\s+hoa\s*(?:dues?|fee)?/i)
    || bodyText.match(/(?:homeowner[s']?\s+assoc[^$]{0,30})\s*(\$[\d,]+)/i);
  if (hoaMatch) result.hoa = extractMoney(hoaMatch[1], true);
  // Rent — keep generic $X/mo matches away from mortgage/payment/HOA/tax text.
  const hoaAmountStr = result.hoa != null ? String(result.hoa) : null;
  for (const pattern of [
    /(?:monthly\s+rent|estimated\s+rent|rent(?:\s+estimate)?)\s*:?\s*(\$[\d,]+)/i,
    /\b(?:rent|rental|lease)\b[^$]{0,80}(\$[\d,]+)\s*\/\s*mo(?:nth)?/i,
    /(\$[\d,]+)\s*\/\s*mo(?:nth)?[^.]{0,80}\b(?:rent|rental|lease)\b/i
  ]) {
    const match = bodyText.match(pattern);
    if (match) {
      const val = extractMoney(match[1] || match[0]);
      if (hoaAmountStr && String(val) === hoaAmountStr) continue;
      result.rent = val; break;
    }
  }
  if (result.rent == null) {
    for (const match of bodyText.matchAll(/(\$[\d,]+)\s*\/\s*mo(?:nth)?/gi)) {
      const val = extractMoney(match[1] || match[0]);
      if (val == null || (hoaAmountStr && String(val) === hoaAmountStr)) continue;
      const index = match.index ?? 0;
      const context = bodyText.slice(Math.max(0, index - 80), index + match[0].length + 80);
      if (hasNonRentMonthlyCostContext(context) && !hasRentContext(context)) continue;
      result.rent = val;
      break;
    }
  }
  // Taxes — prefer annual; if monthly found, multiply by 12
  const annualTaxMatch = bodyText.match(/(?:property\s+)?tax(?:es)?\s*:?\s*(\$[\d,]+)\s*(?:\/\s*(?:yr|year)|per\s+year|annually)/i)
    || bodyText.match(/(?:property\s+)?tax(?:es)?\s*:?\s*(\$[\d,]+)/i);
  if (annualTaxMatch) {
    const val = extractMoney(annualTaxMatch[1]);
    const monthly = /\/\s*mo/.test(annualTaxMatch[0]);
    result.taxes = val != null ? (monthly ? val * 12 : val) : null;
  }
  // Beds / baths / sqft
  const bedsMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*(?:bed(?:room)?s?)\b/i);
  if (bedsMatch) result.beds = Number(bedsMatch[1]);
  const bathsMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?)\b/i);
  if (bathsMatch) result.baths = Number(bathsMatch[1]);
  const sqftMatch = bodyText.match(/([\d,]+)\s*(?:sq\.?\s*ft\.?|square\s*feet)/i);
  if (sqftMatch) result.sqft = Number(sqftMatch[1].replace(/,/g, ''));
  return result;
}
function extractStructuredDataFromHtml(html: string, sourceUrl = ''): JsonRecord {
  const $ = cheerio.load(html);
  const result: JsonRecord = { sourceUrl, address: '', propertyType: '', price: null, rent: null, taxes: null, hoa: null, insurance: null, beds: null, baths: null, sqft: null, parserNotes: [] };
  const metaCandidates = [$('meta[property="og:title"]').attr('content'), $('title').text(), $('meta[name="description"]').attr('content')].filter(Boolean).join(' | ');
  Object.assign(result, parseListingText(metaCandidates, sourceUrl));
  result.photoUrl = $('meta[property="og:image"]').attr('content') || null;

  const scripts = $('script').map((_, el) => ({ type: $(el).attr('type') || '', id: $(el).attr('id') || '', content: $(el).html() || '' })).get();
  for (const { type, id, content } of scripts) {
    const trimmed = content.trim();
    if (!trimmed) continue;
    let parsed: unknown = null;
    // JSON-LD structured data (most reliable)
    if (type === 'application/ld+json') parsed = tryParseJson(trimmed);
    // Zillow embeds all listing data in __NEXT_DATA__
    else if (id === '__NEXT_DATA__') parsed = tryParseJson(trimmed);
    // Any top-level JSON blob
    else if (trimmed.startsWith('{') || trimmed.startsWith('[')) parsed = tryParseJson(trimmed);
    // Inline JS assignment: window.X = {...} or var X = {...}
    else {
      const assignMatch = trimmed.match(/(?:window\.\w+|var\s+\w+)\s*=\s*(\{[\s\S]{20,})/);
      if (assignMatch) parsed = tryParseJson(assignMatch[1].replace(/;\s*$/, ''));
    }
    if (parsed) walkForNumbers(parsed, result);
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const fallback = parseListingText(bodyText, sourceUrl);
  const parserNotes: string[] = [];
  if (sourceUrl.includes('redfin')) parserNotes.push('Applied Redfin-friendly heuristics');
  if (sourceUrl.includes('zillow')) parserNotes.push('Applied Zillow-friendly heuristics');
  // Extract snippets near financial keywords for debugging
  const hoaSnippet = bodyText.match(/.{0,60}hoa.{0,60}/i)?.[0] || null;
  const taxSnippet = bodyText.match(/.{0,60}tax.{0,60}/i)?.[0] || null;
  return {
    sourceUrl,
    address: result.address || fallback.address || '',
    propertyType: result.propertyType || fallback.propertyType || '',
    price: result.price ?? fallback.price ?? null,
    rent: result.rent ?? fallback.rent ?? null,
    taxes: result.taxes ?? fallback.taxes ?? null,
    hoa: result.hoa ?? fallback.hoa ?? null,
    insurance: result.insurance ?? fallback.insurance ?? null,
    beds: result.beds ?? fallback.beds ?? null,
    baths: result.baths ?? fallback.baths ?? null,
    sqft: result.sqft ?? fallback.sqft ?? null,
    photoUrl: result.photoUrl || null,
    parserNotes,
    extracted: { bodyTextPreview: bodyText.slice(0, 3000), hoaSnippet, taxSnippet }
  };
}
async function parseListing(input: JsonRecord = {}) {
  const url = input.url || input.sourceUrl || '';
  const listingText = input.listingText || '';
  if (listingText) return parseListingText(listingText, url);
  if (!url) throw new Error('Provide url or listingText');
  const ua = input._userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const response = await axios.get(url, {
    timeout: 12000,
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
    }
  });
  return extractStructuredDataFromHtml(response.data, url);
}
function mergeListingWithOverrides(parsed: JsonRecord, overrides: JsonRecord) {
  const merged = { ...parsed };
  for (const [key, value] of Object.entries(overrides)) {
    if (!hasInputValue(value)) continue;
    merged[key] = value;
  }
  merged.sourceUrl = overrides.url || parsed.sourceUrl;
  return merged;
}
function compareDeals(rawDeals: JsonRecord[] = []) {
  const analyses = rawDeals.map((deal, index) => ({ rank: index + 1, label: calculateDeal(deal).input.label || `Deal ${index + 1}`, analysis: calculateDeal(deal) }));
  analyses.sort((a, b) => (b.analysis.summary.score - a.analysis.summary.score) || (b.analysis.summary.monthlyCashFlow - a.analysis.summary.monthlyCashFlow));
  analyses.forEach((item, index) => { item.rank = index + 1; });
  return { bestDealLabel: analyses[0] ? analyses[0].label : null, analyses };
}

const tools = [
  { name: 'analyzeDeal', title: 'Analyze real estate deal', description: 'Underwrite a rental property and score it 1-10. Only price is required — rent, taxes, and insurance are estimated when omitted. Accepts: price, rent, taxes (annual), insurance (annual), hoa (monthly), rentComps, city/state/address, otherMonthlyCosts, vacancyRate, repairsRate, capexRate, managementRate, downPaymentPercent, rate, termYears, propertyType, label. Returns score, recommendation (BUY/HOLD/PASS), monthly cash flow, cap rate, cash-on-cash return, break-even rent, estimated inputs, market-rent range, and risks/strengths.', inputSchema: { type: 'object', additionalProperties: true, properties: { price: { type: 'number', description: 'Purchase price in dollars' }, rent: { type: 'number', description: 'Monthly rent in dollars. Estimated from market heuristics or rentComps if omitted.' }, rentComps: { type: 'array', description: 'Optional current rental comps with rent, beds, baths, sqft, distanceMiles, source, and address', items: { type: 'object', additionalProperties: true } }, taxes: { type: 'number', description: 'Annual property taxes in dollars. Estimated from location if omitted.' }, insurance: { type: 'number', description: 'Annual insurance in dollars. Estimated from property type and location if omitted.' }, hoa: { type: 'number', description: 'Monthly HOA fee' }, downPaymentPercent: { type: 'number', description: 'Down payment as decimal, e.g. 0.20 for 20%' }, rate: { type: 'number', description: 'Annual interest rate as decimal, e.g. 0.065' }, propertyType: { type: 'string' }, label: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, state: { type: 'string', description: 'Two-letter state code' } }, required: ['price'] } },
  { name: 'parseListing', title: 'Parse listing', description: 'Extract fields (price, rent, taxes, HOA, address, property type, photo) from a Zillow or Redfin URL or raw listing text.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, listingText: { type: 'string' } } } },
  { name: 'analyzeListing', title: 'Parse and analyze listing', description: 'Parse a Zillow or Redfin listing URL or text, then immediately underwrite it. Pass any additional known fields (rent, taxes, etc.) alongside the url to override parsed values. Best single tool when the user shares a listing link.', inputSchema: { type: 'object', additionalProperties: true, properties: { url: { type: 'string' }, listingText: { type: 'string' } } } },
  { name: 'compareDeals', title: 'Compare multiple deals', description: 'Rank multiple deals side by side by score and cash flow. Each deal in the array accepts the same fields as analyzeDeal.', inputSchema: { type: 'object', properties: { deals: { type: 'array', minItems: 2, items: { type: 'object' } } }, required: ['deals'] } },
  { name: 'saveDeal', title: 'Save deal', description: 'Persist a deal to the signed-in user\'s account so it appears on the dashboard. Accepts the same fields as analyzeDeal. Requires the user to be authenticated.', inputSchema: { type: 'object', additionalProperties: true, properties: { label: { type: 'string' }, price: { type: 'number' }, rent: { type: 'number' } }, required: ['price'] } },
  { name: 'getDeals', title: 'Get saved deals', description: 'Retrieve all saved deals for the currently signed-in user.', inputSchema: { type: 'object', properties: {} } }
];
type JsonRpcId = string | number | null | undefined;

function jsonRpc(id: JsonRpcId, result: unknown) { return { jsonrpc: '2.0', id: id ?? null, result }; }
function jsonRpcError(id: JsonRpcId, code: number, message: string) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }
function buildAnalyzeToolResult(result: ReturnType<typeof calculateDeal>, extra: JsonRecord = {}) {
  const lines = [
    `Deal score: ${result.summary.score}/10 (${result.summary.recommendation})`,
    `Cash flow after debt: ${asCurrency(result.summary.monthlyCashFlow)}/mo`,
    `Cash flow before principal: ${asCurrency(result.summary.monthlyCashFlowBeforePrincipal)}/mo`,
    result.summary.estimatedRent ? `Rent: ${asCurrency(result.input.rent)} (estimated)` : `Rent: ${asCurrency(result.input.rent)}/mo`,
    `Break-even rent: ${asCurrency(result.summary.breakEvenRent)}/mo`
  ];
  if (result.summary.estimatedInputs.taxes || result.summary.estimatedInputs.insurance) {
    lines.push(`Estimated expenses: taxes ${asCurrency(result.input.taxes)}/yr, insurance ${asCurrency(result.input.insurance)}/yr`);
  }
  if (result.risks.length) lines.push(`Key risks: ${result.risks.slice(0, 3).join('; ')}`);
  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    structuredContent: { ...result, ...extra }
  };
}
function buildCompareToolResult(comparison: ReturnType<typeof compareDeals>) {
  return { content: [{ type: 'text', text: comparison.analyses.map(item => `${item.rank}. ${item.label} — score ${item.analysis.summary.score}/10, cash flow after debt ${asCurrency(item.analysis.summary.monthlyCashFlow)}/mo`).join('\n') }], structuredContent: comparison };
}

function defaultClient() {
  const clientId = process.env.DEFAULT_OAUTH_CLIENT_ID || 'chatgpt-dev-client';
  if (!oauthClients.has(clientId)) {
    const fallbackRedirectUri = PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/dashboard` : `http://localhost:${PORT}/dashboard`;
    oauthClients.set(clientId, {
      client_id: clientId,
      client_secret: process.env.DEFAULT_OAUTH_CLIENT_SECRET || '',
      redirect_uris: (process.env.DEFAULT_OAUTH_REDIRECT_URIS || fallbackRedirectUri).split(',').map(v => v.trim()).filter(Boolean),
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'none',
      scope: 'openid profile email deals.read deals.write'
    });
  }
}
defaultClient();

app.get('/auth/google', (req, res, next) => {
  if (!googleAuthConfigured) return res.status(503).send('Google OAuth is not configured');
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});
app.get('/auth/google/callback', (req, res, next) => {
  if (!googleAuthConfigured) return res.status(503).send('Google OAuth is not configured');
  return passport.authenticate('google', { failureRedirect: '/', keepSessionInfo: true })(req, res, next);
}, (req, res) => {
  const returnTo = req.session.returnTo || '/dashboard';
  delete req.session.returnTo;
  res.redirect(returnTo);
});
app.get('/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => res.redirect('/'));
  });
});
app.get('/whoami', (req, res) => {
  res.json(currentUser(req) || bearerUser(req) || null);
});

app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const origin = baseUrl(req);
  res.json({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['openid', 'profile', 'email', 'deals.read', 'deals.write']
  });
});
app.get('/.well-known/oauth-protected-resource', (req, res) => {
  const origin = baseUrl(req);
  res.json({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: ['deals.read', 'deals.write']
  });
});
app.post('/register', (req, res) => {
  const redirectUris = Array.isArray(req.body.redirect_uris) ? req.body.redirect_uris : [];
  const tokenMethod = req.body.token_endpoint_auth_method || 'none';
  const clientId = `client_${uuidv4()}`;
  const clientSecret = tokenMethod === 'none' ? '' : randomToken();
  const client = {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: tokenMethod,
    scope: req.body.scope || 'openid profile email deals.read deals.write',
    client_name: req.body.client_name || 'Dynamic client'
  };
  oauthClients.set(clientId, client);
  res.status(201).json(client);
});
app.get('/authorize', (req, res) => {
  const response_type = queryParam(req.query.response_type);
  const client_id = queryParam(req.query.client_id);
  const redirect_uri = queryParam(req.query.redirect_uri);
  const state = queryParam(req.query.state);
  const scope = queryParam(req.query.scope);
  const code_challenge = queryParam(req.query.code_challenge);
  const code_challenge_method = queryParam(req.query.code_challenge_method);
  const client = oauthClients.get(client_id);
  if (!client) return res.status(400).send('Unknown client_id');
  if (response_type !== 'code') return res.status(400).send('Unsupported response_type');
  if (!redirect_uri || !client.redirect_uris.includes(redirect_uri)) return res.status(400).send('Invalid redirect_uri');
  if (!code_challenge || code_challenge_method !== 'S256') return res.status(400).send('PKCE S256 required');
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/google');
  }
  const code = randomToken();
  oauthCodes.set(code, {
    client_id,
    redirect_uri,
    userId: req.user.id,
    scope: scope || 'openid profile email deals.read deals.write',
    code_challenge,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
  const redirect = new URL(redirect_uri);
  redirect.searchParams.set('code', code);
  if (state) redirect.searchParams.set('state', state);
  res.redirect(redirect.toString());
});
app.post('/token', (req, res) => {
  const grantType = req.body.grant_type;
  const clientId = req.body.client_id;
  const clientSecret = req.body.client_secret;
  const client = oauthClients.get(clientId);
  if (!client) return res.status(400).json({ error: 'invalid_client' });
  if (client.token_endpoint_auth_method !== 'none' && client.client_secret !== clientSecret) {
    return res.status(400).json({ error: 'invalid_client' });
  }
  if (grantType === 'authorization_code') {
    const code = req.body.code;
    const codeVerifier = req.body.code_verifier;
    const redirectUri = req.body.redirect_uri;
    const record = oauthCodes.get(code);
    if (!record || record.expiresAt < Date.now()) return res.status(400).json({ error: 'invalid_grant' });
    if (record.client_id !== clientId || record.redirect_uri !== redirectUri) return res.status(400).json({ error: 'invalid_grant' });
    if (!codeVerifier || sha256base64url(codeVerifier) !== record.code_challenge) return res.status(400).json({ error: 'invalid_grant' });
    oauthCodes.delete(code);
    const accessToken = randomToken();
    const refreshToken = randomToken();
    oauthAccessTokens.set(accessToken, { userId: record.userId, client_id: clientId, scope: record.scope, expiresAt: Date.now() + 3600 * 1000 });
    oauthRefreshTokens.set(refreshToken, { userId: record.userId, client_id: clientId, scope: record.scope });
    return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600, refresh_token: refreshToken, scope: record.scope });
  }
  if (grantType === 'refresh_token') {
    const refreshToken = req.body.refresh_token;
    const record = oauthRefreshTokens.get(refreshToken);
    if (!record || record.client_id !== clientId) return res.status(400).json({ error: 'invalid_grant' });
    const accessToken = randomToken();
    oauthAccessTokens.set(accessToken, { userId: record.userId, client_id: clientId, scope: record.scope, expiresAt: Date.now() + 3600 * 1000 });
    return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600, refresh_token: refreshToken, scope: record.scope });
  }
  return res.status(400).json({ error: 'unsupported_grant_type' });
});

app.get('/', (_req, res) => res.redirect('/dashboard'));
app.get('/health', (req, res) => res.json({ ok: true, app: APP_NAME, version: APP_VERSION }));
app.get('/debug/auth', (req, res) => {
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const tokenRow = token ? (() => { try { return db.prepare('SELECT * FROM oauth_tokens WHERE token = ? AND type = ?').get(token, 'access') as any; } catch { return 'db-error'; } })() : null;
  const userCount = (() => { try { return (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c; } catch { return 'db-error'; } })();
  const tokenCount = (() => { try { return (db.prepare('SELECT COUNT(*) as c FROM oauth_tokens').get() as any).c; } catch { return 'db-error'; } })();
  res.json({
    version: APP_VERSION,
    dbPath,
    googleAuthConfigured,
    publicBaseUrl: PUBLIC_BASE_URL || null,
    isLocalOrigin,
    anonymousModeEnabled: ALLOW_ANONYMOUS_MODE,
    signedIn: Boolean(sessionOrBearerUser(req)),
    userCount,
    tokenCount,
    tokenFound: token ? Boolean(tokenRow) : 'no-bearer-header',
    tokenExpired: tokenRow && typeof tokenRow === 'object' ? (tokenRow.expires_at && tokenRow.expires_at < Date.now() ? true : false) : null,
  });
});
app.get('/.well-known/openai-apps-challenge', (_req, res) => res.type('text').send('NkH-RDeGXlSJZRHoMRFoAhZfhb6JM7sABBUB4k9Y_zw'));
app.get('/.well-known/app.json', (req, res) => {
  res.json({ name: 'Deal Analyzer MCP', description: 'ChatGPT app for underwriting, saving, and comparing real estate deals.', mcp_url: `${baseUrl(req)}/mcp`, developer: { name: 'opolyo01' } });
});
app.post('/analyze', (req, res) => {
  try { res.json(calculateDeal(req.body || {})); } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to analyze deal.') }); }
});
app.post('/parse-listing', async (req, res) => {
  try { res.json(await parseListing({ ...req.body, _userAgent: req.headers['user-agent'] })); } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to parse listing.') }); }
});
app.post('/compare', (req, res) => {
  try { res.json(compareDeals(req.body?.deals || [])); } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to compare deals.') }); }
});
app.post('/saveDeal', (req, res) => {
  try {
    const user = sessionOrBearerUser(req);
    if (!user && !ALLOW_ANONYMOUS_MODE) return res.status(401).json({ error: 'login_required', loginUrl: '/auth/google' });
    const analysis = calculateDeal(req.body || {});
    const id = saveDealRecord(req.body || {}, analysis, user ? user.id : null);
    res.json({ id, analysis, user: user ? { id: user.id, email: user.email } : null });
  } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to save deal.') }); }
});
app.get('/agent-config', (_req, res) => { res.json(AGENT_CONFIG); });
app.get('/deals', (req, res) => {
  try {
    const user = sessionOrBearerUser(req);
    if (!user && !ALLOW_ANONYMOUS_MODE) return res.json([]);
    res.json(getSavedDeals(user ? user.id : null));
  } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to get deals.') }); }
});
app.delete('/deals/:id', (req, res) => {
  try {
    const user = sessionOrBearerUser(req);
    if (!user && !ALLOW_ANONYMOUS_MODE) return res.status(401).json({ error: 'login_required', loginUrl: '/auth/google' });
    const userId = user ? user.id : null;
    const existing = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id) as { userId: string | null } | undefined;
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (existing.userId !== userId) return res.status(403).json({ error: 'forbidden' });
    db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
    res.json({ deleted: req.params.id });
  } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to delete deal.') }); }
});
app.get('/privacy', (_req, res) => res.sendFile(path.join(projectRoot, 'public', 'privacy.html')));
app.get('/terms', (_req, res) => res.sendFile(path.join(projectRoot, 'public', 'terms.html')));
app.get('/dashboard', (_req, res) => {
  if (fs.existsSync(dashboardPath)) return res.sendFile(dashboardPath);
  return res.type('html').send('<html><body><h2>Dashboard missing</h2><p>Create dashboard.html to render saved deals.</p></body></html>');
});
app.post('/mcp', async (req, res) => {
  const { id, method, params } = req.body || {};
  const authHeader = req.headers.authorization || '(none)';
  const tokenPreview = authHeader.startsWith('Bearer ') ? authHeader.slice(7, 16) + '…' : authHeader;
  console.log(`[mcp] method=${method} tool=${params?.name ?? '-'} auth=${tokenPreview}`);
  try {
    if (method === 'initialize') return res.json(jsonRpc(id, { protocolVersion: '2024-11-05', serverInfo: { name: APP_NAME, version: APP_VERSION }, capabilities: { tools: {} } }));
    if (method === 'tools/list') return res.json(jsonRpc(id, { tools }));
    if (method === 'tools/call') {
      const name = params?.name;
      const args = params?.arguments || {};
      if (name === 'analyzeDeal') return res.json(jsonRpc(id, buildAnalyzeToolResult(calculateDeal(args))));
      if (name === 'parseListing') {
        const parsed = await parseListing(args);
        return res.json(jsonRpc(id, { content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }], structuredContent: parsed }));
      }
      if (name === 'analyzeListing') {
        const parsed = await parseListing(args);
        const merged = mergeListingWithOverrides(parsed, args);
        return res.json(jsonRpc(id, buildAnalyzeToolResult(calculateDeal(merged), { parsedListing: parsed })));
      }
      if (name === 'compareDeals') return res.json(jsonRpc(id, buildCompareToolResult(compareDeals(args.deals || []))));
      if (name === 'saveDeal' || name === 'getDeals') {
        const user = sessionOrBearerUser(req);
        if (name === 'getDeals') {
          try {
            if (!user) return res.json(jsonRpc(id, { content: [{ type: 'text', text: 'Not authenticated — reconnect Deal Analyzer in ChatGPT settings to load saved deals.' }], structuredContent: { deals: [], authenticated: false } }));
            const deals = getSavedDeals(user.id);
            return res.json(jsonRpc(id, { content: [{ type: 'text', text: `Found ${deals.length} deals` }], structuredContent: { deals, count: deals.length } }));
          } catch (err) {
            return res.json(jsonRpc(id, { content: [{ type: 'text', text: `getDeals error: ${errorMessage(err, 'unknown')} | user=${user?.id ?? 'null'} | dbPath=${dbPath}` }], structuredContent: { deals: [], error: errorMessage(err, 'unknown') } }));
          }
        }
        if (!user && !ALLOW_ANONYMOUS_MODE) return res.json(jsonRpc(id, { content: [{ type: 'text', text: 'Authentication required to save deals. Please reconnect Deal Analyzer in ChatGPT settings.' }], structuredContent: { error: 'unauthenticated' } }));
        const analysis = calculateDeal(args);
        const savedId = saveDealRecord(args, analysis, user ? user.id : null);
        return res.json(jsonRpc(id, { content: [{ type: 'text', text: 'Deal saved successfully' }], structuredContent: { id: savedId, ...analysis } }));
      }
      return res.json(jsonRpcError(id, -32601, 'Unknown tool'));
    }
    return res.json(jsonRpcError(id, -32601, 'Unknown method'));
  } catch (error) {
    return res.json(jsonRpcError(id, -32000, errorMessage(error, 'Server error')));
  }
});

app.listen(PORT, () => {
  console.log(`${APP_NAME} listening on port ${PORT}`);
});
