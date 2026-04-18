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
  client_secret: string | null;
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
const APP_VERSION = '1.8.0';
const DEFAULT_RATE = Number(process.env.DEFAULT_RATE || 0.065);
const DEFAULT_TERM_YEARS = Number(process.env.DEFAULT_TERM_YEARS || 30);
const DEFAULT_VACANCY_RATE = Number(process.env.DEFAULT_VACANCY_RATE || 0.05);
const DEFAULT_REPAIRS_RATE = Number(process.env.DEFAULT_REPAIRS_RATE || 0.05);
const DEFAULT_CAPEX_RATE = Number(process.env.DEFAULT_CAPEX_RATE || 0.05);
const DEFAULT_MANAGEMENT_RATE = Number(process.env.DEFAULT_MANAGEMENT_RATE || 0.08);
const PORT = Number(process.env.PORT || 3000);
const dashboardPath = path.join(projectRoot, 'dashboard.html');
const PUBLIC_BASE_URL = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || (PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/auth/google/callback` : '/auth/google/callback');
const ALLOW_ANONYMOUS_MODE = process.env.ALLOW_ANONYMOUS_MODE === 'true';

const db = new Database(path.join(projectRoot, 'deals.db'));
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

const oauthClients = new Map<string, OAuthClient>();
const oauthCodes = new Map<string, OAuthCodeRecord>();
const oauthAccessTokens = new Map<string, OAuthTokenRecord>();
const oauthRefreshTokens = new Map<string, OAuthTokenRecord>();

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

  return rows.map(row => ({
    id: row.id,
    userId: row.userId,
    label: row.label,
    createdAt: row.createdAt,
    input: JSON.parse(row.input),
    analysis: JSON.parse(row.analysis)
  }));
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
function requireDashboardUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (ALLOW_ANONYMOUS_MODE || sessionOrBearerUser(req)) return next();
  if (!googleAuthConfigured) return res.status(503).send('Google OAuth is not configured');
  req.session.returnTo = req.originalUrl;
  return res.redirect('/auth/google');
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
function calculateMortgagePayment(principal: number, annualRate: number, termYears: number) {
  if (!principal || principal <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const numberOfPayments = termYears * 12;
  if (!monthlyRate) return principal / numberOfPayments;
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
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
function estimateRent(price: number, propertyType = '') {
  if (!price) return { rent: 0, estimated: true, confidence: 'low' };
  const kind = String(propertyType || '').toLowerCase();
  let ratio = 0.006;
  if (price < 300000) ratio = 0.008;
  if (price > 800000) ratio = 0.005;
  if (kind.includes('multi') || kind.includes('duplex') || kind.includes('triplex') || kind.includes('quad')) ratio += 0.001;
  if (kind.includes('condo')) ratio -= 0.0005;
  return { rent: Math.round(price * ratio), estimated: true, confidence: price >= 250000 && price <= 900000 ? 'medium' : 'low' };
}
function normalizeDealInput(input: JsonRecord = {}) {
  const price = Number(input.price || 0);
  const rentProvided = input.rent != null && input.rent !== '';
  let rentEstimate: ReturnType<typeof estimateRent> | null = null;
  let rent = Number(input.rent || 0);
  if (!rentProvided) {
    rentEstimate = estimateRent(price, input.propertyType);
    rent = rentEstimate.rent;
  }
  const downPaymentAmount = parseDownPayment(input, price);
  return {
    label: input.label || input.address || input.sourceUrl || '',
    address: input.address || '',
    sourceUrl: input.sourceUrl || input.url || '',
    price,
    rent,
    estimatedRent: !rentProvided,
    estimatedRentConfidence: rentEstimate ? rentEstimate.confidence : null,
    taxes: Number(input.taxes || 0),
    insurance: Number(input.insurance || 0),
    hoa: Number(input.hoa || 0),
    otherMonthlyCosts: Number(input.otherMonthlyCosts || 0),
    rate: input.rate != null ? Number(input.rate) : DEFAULT_RATE,
    termYears: input.termYears != null ? Number(input.termYears) : DEFAULT_TERM_YEARS,
    downPaymentAmount,
    downPaymentPercent: price > 0 ? downPaymentAmount / price : 0,
    vacancyRate: input.vacancyRate != null ? Number(input.vacancyRate) : DEFAULT_VACANCY_RATE,
    repairsRate: input.repairsRate != null ? Number(input.repairsRate) : DEFAULT_REPAIRS_RATE,
    capexRate: input.capexRate != null ? Number(input.capexRate) : DEFAULT_CAPEX_RATE,
    managementRate: input.managementRate != null ? Number(input.managementRate) : DEFAULT_MANAGEMENT_RATE,
    propertyType: input.propertyType || '',
    beds: input.beds != null ? Number(input.beds) : null,
    baths: input.baths != null ? Number(input.baths) : null,
    sqft: input.sqft != null ? Number(input.sqft) : null
  };
}
function calculateDeal(rawInput: JsonRecord = {}) {
  const input = normalizeDealInput(rawInput);
  const loanAmount = Math.max(input.price - input.downPaymentAmount, 0);
  const monthlyMortgage = calculateMortgagePayment(loanAmount, input.rate, input.termYears);
  const monthlyTaxes = annualToMonthly(input.taxes);
  const monthlyInsurance = annualToMonthly(input.insurance);
  const monthlyVacancy = input.rent * input.vacancyRate;
  const monthlyRepairs = input.rent * input.repairsRate;
  const monthlyCapex = input.rent * input.capexRate;
  const monthlyManagement = input.rent * input.managementRate;
  const monthlyOperatingExpense = monthlyTaxes + monthlyInsurance + input.hoa + input.otherMonthlyCosts + monthlyVacancy + monthlyRepairs + monthlyCapex + monthlyManagement;
  const monthlyAllInCost = monthlyMortgage + monthlyOperatingExpense;
  const monthlyCashFlow = input.rent - monthlyAllInCost;
  const annualNOI = (input.rent * 12) - (monthlyOperatingExpense * 12);
  const annualDebtService = monthlyMortgage * 12;
  const capRate = input.price > 0 ? annualNOI / input.price : 0;
  const grossYield = input.price > 0 ? (input.rent * 12) / input.price : 0;
  const cashOnCashReturn = input.downPaymentAmount > 0 ? ((monthlyCashFlow * 12) / input.downPaymentAmount) : 0;
  const dscr = annualDebtService > 0 ? annualNOI / annualDebtService : 0;
  const breakEvenRent = monthlyAllInCost;

  let score = 5;
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
  if (input.taxes === 0) risks.push('Property taxes are missing, so the model may be optimistic');
  if (input.insurance === 0) risks.push('Insurance is missing, so monthly cost may be understated');
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
      monthlyOperatingExpense: round(monthlyOperatingExpense),
      monthlyAllInCost: round(monthlyAllInCost),
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
      managementRate: input.managementRate
    },
    strengths,
    risks
  };
}
function tryParseJson(value: string) {
  try { return JSON.parse(value); } catch { return null; }
}
function extractMoney(text: unknown) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\$?\s*([\d,]{4,})(?:\.\d{2})?/);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ''));
}
function walkForNumbers(node: unknown, out: JsonRecord) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(item => walkForNumbers(item, out));
  for (const [key, value] of Object.entries(node)) {
    const lower = key.toLowerCase();
    if (typeof value === 'number') {
      if (out.price == null && (lower.includes('price') || lower === 'amount')) out.price = value;
      if (out.rent == null && lower.includes('rent')) out.rent = value;
      if (out.taxes == null && (lower.includes('tax') || lower.includes('propertytax'))) out.taxes = value;
      if (out.beds == null && (lower.includes('bed') || lower === 'bedrooms')) out.beds = value;
      if (out.baths == null && (lower.includes('bath') || lower === 'bathrooms')) out.baths = value;
      if (out.sqft == null && (lower.includes('sqft') || lower.includes('floorarea') || lower.includes('livingarea'))) out.sqft = value;
    } else if (typeof value === 'string') {
      const addressMatch = value.match(/\d+ .+, [A-Za-z .'-]+, [A-Z]{2} \d{5}/);
      if (!out.address && addressMatch) out.address = addressMatch[0];
      if (!out.propertyType && (lower.includes('propertytype') || lower === 'hometype')) out.propertyType = value;
      const money = extractMoney(value);
      if (money != null) {
        if (out.price == null && (lower.includes('price') || lower === 'offers')) out.price = money;
        if (out.rent == null && lower.includes('rent')) out.rent = money;
        if (out.taxes == null && lower.includes('tax')) out.taxes = money;
      }
    }
    walkForNumbers(value, out);
  }
}
function parseListingText(text: unknown, sourceUrl = ''): JsonRecord {
  const bodyText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!bodyText) return {};
  const result: JsonRecord = { sourceUrl, address: '', propertyType: '', price: null, rent: null, taxes: null, beds: null, baths: null, sqft: null, parserNotes: [] };
  const addressMatch = bodyText.match(/\d{1,6}\s+[A-Za-z0-9.'\- ]+,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5}/);
  if (addressMatch) result.address = addressMatch[0].trim();
  const propertyTypeMatch = bodyText.match(/\b(single family|single-family|multifamily|multi-family|duplex|triplex|quadruplex|condo|townhome|townhouse|apartment)\b/i);
  if (propertyTypeMatch) result.propertyType = propertyTypeMatch[1];
  for (const pattern of [/(?:list(?:ing)?\s+price|listed\s+for|price)\D{0,20}(\$[\d,]+)/i, /(\$[\d,]{5,})/]) {
    const match = bodyText.match(pattern);
    if (match) { result.price = extractMoney(match[1]); break; }
  }
  for (const pattern of [/(?:monthly\s+rent|estimated\s+rent|rent)\D{0,30}(\$[\d,]+)/i, /(?:\$[\d,]+\s*\/\s*mo)/i]) {
    const match = bodyText.match(pattern);
    if (match) { result.rent = extractMoney(match[1] || match[0]); break; }
  }
  const taxesMatch = bodyText.match(/(?:property\s+tax(?:es)?|tax(?:es)?)\D{0,25}(\$[\d,]+)/i);
  if (taxesMatch) result.taxes = extractMoney(taxesMatch[1]);
  const bedsMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*beds?/i);
  if (bedsMatch) result.beds = Number(bedsMatch[1]);
  const bathsMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*baths?/i);
  if (bathsMatch) result.baths = Number(bathsMatch[1]);
  const sqftMatch = bodyText.match(/([\d,]+)\s*(?:sq\.?\s*ft|square\s*feet)/i);
  if (sqftMatch) result.sqft = Number(sqftMatch[1].replace(/,/g, ''));
  return result;
}
function extractStructuredDataFromHtml(html: string, sourceUrl = ''): JsonRecord {
  const $ = cheerio.load(html);
  const result: JsonRecord = { sourceUrl, address: '', propertyType: '', price: null, rent: null, taxes: null, beds: null, baths: null, sqft: null, parserNotes: [] };
  const metaCandidates = [$('meta[property="og:title"]').attr('content'), $('title').text(), $('meta[name="description"]').attr('content')].filter(Boolean).join(' | ');
  Object.assign(result, parseListingText(metaCandidates, sourceUrl));
  const scripts = $('script').map((_, el) => $(el).html()).get().filter(Boolean);
  for (const scriptContent of scripts) {
    const trimmed = scriptContent.trim();
    let parsed = null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) parsed = tryParseJson(trimmed);
    if (!parsed && /"@type"\s*:\s*"Residence"|jsonld/i.test(trimmed)) {
      const jsonStart = trimmed.indexOf('{');
      if (jsonStart >= 0) parsed = tryParseJson(trimmed.slice(jsonStart));
    }
    if (parsed) walkForNumbers(parsed, result);
  }
  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const fallback = parseListingText(bodyText, sourceUrl);
  return {
    sourceUrl,
    address: result.address || fallback.address || '',
    propertyType: result.propertyType || fallback.propertyType || '',
    price: result.price ?? fallback.price ?? null,
    rent: result.rent ?? fallback.rent ?? null,
    taxes: result.taxes ?? fallback.taxes ?? null,
    beds: result.beds ?? fallback.beds ?? null,
    baths: result.baths ?? fallback.baths ?? null,
    sqft: result.sqft ?? fallback.sqft ?? null,
    parserNotes: [sourceUrl.includes('redfin') ? 'Applied Redfin-friendly heuristics' : null, sourceUrl.includes('zillow') ? 'Applied Zillow-friendly heuristics' : null].filter(Boolean),
    extracted: { bodyTextPreview: bodyText.slice(0, 500) }
  };
}
async function parseListing(input: JsonRecord = {}) {
  const url = input.url || input.sourceUrl || '';
  const listingText = input.listingText || '';
  if (listingText) return parseListingText(listingText, url);
  if (!url) throw new Error('Provide url or listingText');
  const response = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'deal-analyzer-mcp/1.8.0 (+https://github.com/opolyo01/deal-analyzer-mcp)' } });
  return extractStructuredDataFromHtml(response.data, url);
}
function compareDeals(rawDeals: JsonRecord[] = []) {
  const analyses = rawDeals.map((deal, index) => ({ rank: index + 1, label: calculateDeal(deal).input.label || `Deal ${index + 1}`, analysis: calculateDeal(deal) }));
  analyses.sort((a, b) => (b.analysis.summary.score - a.analysis.summary.score) || (b.analysis.summary.monthlyCashFlow - a.analysis.summary.monthlyCashFlow));
  analyses.forEach((item, index) => { item.rank = index + 1; });
  return { bestDealLabel: analyses[0] ? analyses[0].label : null, analyses };
}

const tools = [
  { name: 'analyzeDeal', title: 'Analyze real estate deal', description: 'Underwrite a rental property.', inputSchema: { type: 'object', additionalProperties: true, properties: { price: { type: 'number' }, rent: { type: 'number' } }, required: ['price'] } },
  { name: 'parseListing', title: 'Parse listing', description: 'Extract fields from listing text or URL.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, listingText: { type: 'string' } } } },
  { name: 'analyzeListing', title: 'Parse and analyze listing', description: 'Parse a listing then underwrite it.', inputSchema: { type: 'object', additionalProperties: true, properties: { url: { type: 'string' }, listingText: { type: 'string' } } } },
  { name: 'compareDeals', title: 'Compare multiple deals', description: 'Rank multiple deals side by side.', inputSchema: { type: 'object', properties: { deals: { type: 'array', minItems: 2, items: { type: 'object' } } }, required: ['deals'] } },
  { name: 'saveDeal', title: 'Save deal', description: 'Persist a deal to the current signed-in user.', inputSchema: { type: 'object', additionalProperties: true, properties: { label: { type: 'string' }, price: { type: 'number' }, rent: { type: 'number' } }, required: ['price'] } },
  { name: 'getDeals', title: 'Get saved deals', description: 'Retrieve saved deals for the current signed-in user.', inputSchema: { type: 'object', properties: {} } }
];
type JsonRpcId = string | number | null | undefined;

function jsonRpc(id: JsonRpcId, result: unknown) { return { jsonrpc: '2.0', id: id ?? null, result }; }
function jsonRpcError(id: JsonRpcId, code: number, message: string) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }
function buildAnalyzeToolResult(result: ReturnType<typeof calculateDeal>, extra: JsonRecord = {}) {
  return {
    content: [{ type: 'text', text: [`Deal score: ${result.summary.score}/10 (${result.summary.recommendation})`, `Cash flow: ${asCurrency(result.summary.monthlyCashFlow)}/mo`, result.summary.estimatedRent ? `Rent: ${asCurrency(result.input.rent)} (estimated)` : `Rent: ${asCurrency(result.input.rent)}/mo`, `Break-even rent: ${asCurrency(result.summary.breakEvenRent)}/mo`].join('\n') }],
    structuredContent: { ...result, ...extra }
  };
}
function buildCompareToolResult(comparison: ReturnType<typeof compareDeals>) {
  return { content: [{ type: 'text', text: comparison.analyses.map(item => `${item.rank}. ${item.label} — score ${item.analysis.summary.score}/10, cash flow ${asCurrency(item.analysis.summary.monthlyCashFlow)}/mo`).join('\n') }], structuredContent: comparison };
}

function defaultClient() {
  const clientId = process.env.DEFAULT_OAUTH_CLIENT_ID || 'chatgpt-dev-client';
  if (!oauthClients.has(clientId)) {
    const fallbackRedirectUri = PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/dashboard` : `http://localhost:${PORT}/dashboard`;
    oauthClients.set(clientId, {
      client_id: clientId,
      client_secret: process.env.DEFAULT_OAUTH_CLIENT_SECRET || null,
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
  return passport.authenticate('google', { failureRedirect: '/' })(req, res, next);
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
  const clientSecret = tokenMethod === 'none' ? null : randomToken();
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

app.get('/', (req, res) => {
  res.json({
    name: APP_NAME,
    version: APP_VERSION,
    endpoints: {
      mcp: '/mcp', health: '/health', analyze: '/analyze', parseListing: '/parse-listing', compare: '/compare', saveDeal: '/saveDeal', deals: '/deals', dashboard: '/dashboard', authorize: '/authorize', token: '/token', register: '/register'
    }
  });
});
app.get('/health', (req, res) => res.json({ ok: true, app: APP_NAME, version: APP_VERSION }));
app.get('/.well-known/app.json', (req, res) => {
  res.json({ name: 'Deal Analyzer MCP', description: 'ChatGPT app for underwriting, saving, and comparing real estate deals.', mcp_url: `${baseUrl(req)}/mcp`, developer: { name: 'opolyo01' } });
});
app.post('/analyze', (req, res) => {
  try { res.json(calculateDeal(req.body || {})); } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to analyze deal.') }); }
});
app.post('/parse-listing', async (req, res) => {
  try { res.json(await parseListing(req.body || {})); } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to parse listing.') }); }
});
app.post('/compare', (req, res) => {
  try { res.json(compareDeals(req.body?.deals || [])); } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to compare deals.') }); }
});
app.post('/saveDeal', (req, res) => {
  try {
    const user = sessionOrBearerUser(req);
    if (!user && !ALLOW_ANONYMOUS_MODE) return res.status(401).json({ error: 'unauthorized' });
    const analysis = calculateDeal(req.body || {});
    const id = saveDealRecord(req.body || {}, analysis, user ? user.id : null);
    res.json({ id, analysis, user: user ? { id: user.id, email: user.email } : null });
  } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to save deal.') }); }
});
app.get('/deals', (req, res) => {
  try {
    const user = sessionOrBearerUser(req);
    if (!user && !ALLOW_ANONYMOUS_MODE) return res.status(401).json({ error: 'unauthorized' });
    res.json(getSavedDeals(user ? user.id : null));
  } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to get deals.') }); }
});
app.get('/dashboard', requireDashboardUser, (req, res) => {
  if (fs.existsSync(dashboardPath)) return res.sendFile(dashboardPath);
  return res.type('html').send('<html><body><h2>Dashboard missing</h2><p>Create dashboard.html to render saved deals.</p></body></html>');
});
app.post('/mcp', async (req, res) => {
  const { id, method, params } = req.body || {};
  try {
    if (method === 'initialize') return res.json(jsonRpc(id, { serverInfo: { name: APP_NAME, version: APP_VERSION }, capabilities: { tools: {} } }));
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
        const merged = { ...args, ...parsed, sourceUrl: args.url || parsed.sourceUrl };
        return res.json(jsonRpc(id, buildAnalyzeToolResult(calculateDeal(merged), { parsedListing: parsed })));
      }
      if (name === 'compareDeals') return res.json(jsonRpc(id, buildCompareToolResult(compareDeals(args.deals || []))));
      if (name === 'saveDeal' || name === 'getDeals') {
        const user = sessionOrBearerUser(req);
        if (!user && !ALLOW_ANONYMOUS_MODE) return res.status(401).json(jsonRpcError(id, 401, 'Authentication required'));
        if (name === 'saveDeal') {
          const analysis = calculateDeal(args);
          const savedId = saveDealRecord(args, analysis, user ? user.id : null);
          return res.json(jsonRpc(id, { content: [{ type: 'text', text: 'Deal saved successfully' }], structuredContent: { id: savedId, ...analysis } }));
        }
        const deals = getSavedDeals(user ? user.id : null);
        return res.json(jsonRpc(id, { content: [{ type: 'text', text: `Found ${deals.length} deals` }], structuredContent: deals }));
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
