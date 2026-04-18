const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false }
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
const dashboardPath = path.join(__dirname, 'dashboard.html');

const db = new Database(path.join(__dirname, 'deals.db'));
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

const dealColumns = db.prepare('PRAGMA table_info(deals)').all();
if (!dealColumns.find(c => c.name === 'userId')) {
  db.prepare('ALTER TABLE deals ADD COLUMN userId TEXT').run();
}

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
}, (accessToken, refreshToken, profile, done) => {
  try {
    let user = db.prepare('SELECT * FROM users WHERE googleId = ?').get(profile.id);
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
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    done(null, user || null);
  } catch (error) {
    done(error);
  }
});

const oauthClients = new Map();
const oauthCodes = new Map();
const oauthAccessTokens = new Map();
const oauthRefreshTokens = new Map();

function baseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}
function sha256base64url(input) {
  return crypto.createHash('sha256').update(input).digest('base64url');
}
function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}
function saveDealRecord(input, analysis, userId = null) {
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
function getSavedDeals(userId = null) {
  const rows = userId
    ? db.prepare('SELECT * FROM deals WHERE userId = ? ORDER BY createdAt DESC').all(userId)
    : db.prepare('SELECT * FROM deals WHERE userId IS NULL ORDER BY createdAt DESC').all();

  return rows.map(row => ({
    id: row.id,
    userId: row.userId,
    label: row.label,
    createdAt: row.createdAt,
    input: JSON.parse(row.input),
    analysis: JSON.parse(row.analysis)
  }));
}
function currentUser(req) {
  return req.user || null;
}
function bearerUser(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length);
  const tokenRow = oauthAccessTokens.get(token);
  if (!tokenRow || tokenRow.expiresAt < Date.now()) return null;
  return getUserById(tokenRow.userId);
}
function sessionOrBearerUser(req) {
  return currentUser(req) || bearerUser(req);
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function annualToMonthly(value) {
  return Number(value || 0) / 12;
}
function asCurrency(value) {
  const sign = value < 0 ? '-' : '';
  const amount = Math.abs(Math.round(value || 0));
  return `${sign}$${amount.toLocaleString('en-US')}`;
}
function calculateMortgagePayment(principal, annualRate, termYears) {
  if (!principal || principal <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const numberOfPayments = termYears * 12;
  if (!monthlyRate) return principal / numberOfPayments;
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
}
function parseDownPayment(input, price) {
  if (input.downPaymentAmount != null) return Number(input.downPaymentAmount);
  if (input.downPaymentPercent != null) return price * Number(input.downPaymentPercent);
  if (input.downPayment != null) {
    const value = Number(input.downPayment);
    return value <= 1 ? price * value : value;
  }
  return price * 0.2;
}
function estimateRent(price, propertyType = '') {
  if (!price) return { rent: 0, estimated: true, confidence: 'low' };
  const kind = String(propertyType || '').toLowerCase();
  let ratio = 0.006;
  if (price < 300000) ratio = 0.008;
  if (price > 800000) ratio = 0.005;
  if (kind.includes('multi') || kind.includes('duplex') || kind.includes('triplex') || kind.includes('quad')) ratio += 0.001;
  if (kind.includes('condo')) ratio -= 0.0005;
  return { rent: Math.round(price * ratio), estimated: true, confidence: price >= 250000 && price <= 900000 ? 'medium' : 'low' };
}
function normalizeDealInput(input = {}) {
  const price = Number(input.price || 0);
  const rentProvided = input.rent != null && input.rent !== '';
  const rentEstimate = rentProvided ? null : estimateRent(price, input.propertyType);
  const rent = rentProvided ? Number(input.rent) : rentEstimate.rent;
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
function calculateDeal(rawInput = {}) {
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
function tryParseJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}
function extractMoney(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\$?\s*([\d,]{4,})(?:\.\d{2})?/);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ''));
}
function walkForNumbers(node, out) {
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
      if (!out.address && /\d+ .+, [A-Za-z .'-]+, [A-Z]{2} \d{5}/.test(value)) out.address = value.match(/\d+ .+, [A-Za-z .'-]+, [A-Z]{2} \d{5}/)[0];
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
function parseListingText(text, sourceUrl = '') {
  const bodyText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!bodyText) return {};
  const result = { sourceUrl, address: '', propertyType: '', price: null, rent: null, taxes: null, beds: null, baths: null, sqft: null, parserNotes: [] };
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
function extractStructuredDataFromHtml(html, sourceUrl = '') {
  const $ = cheerio.load(html);
  const result = { sourceUrl, address: '', propertyType: '', price: null, rent: null, taxes: null, beds: null, baths: null, sqft: null, parserNotes: [] };
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
async function parseListing(input = {}) {
  const url = input.url || input.sourceUrl || '';
  const listingText = input.listingText || '';
  if (listingText) return parseListingText(listingText, url);
  if (!url) throw new Error('Provide url or listingText');
  const response = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': 'deal-analyzer-mcp/1.8.0 (+https://github.com/opolyo01/deal-analyzer-mcp)' } });
  return extractStructuredDataFromHtml(response.data, url);
}
function compareDeals(rawDeals = []) {
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
function jsonRpc(id, result) { return { jsonrpc: '2.0', id: id ?? null, result }; }
function jsonRpcError(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }
function buildAnalyzeToolResult(result, extra = {}) {
  return {
    content: [{ type: 'text', text: [`Deal score: ${result.summary.score}/10 (${result.summary.recommendation})`, `Cash flow: ${asCurrency(result.summary.monthlyCashFlow)}/mo`, result.summary.estimatedRent ? `Rent: ${asCurrency(result.input.rent)} (estimated)` : `Rent: ${asCurrency(result.input.rent)}/mo`, `Break-even rent: ${asCurrency(result.summary.breakEvenRent)}/mo`].join('\n') }],
    structuredContent: { ...result, ...extra }
  };
}
function buildCompareToolResult(comparison) {
  return { content: [{ type: 'text', text: comparison.analyses.map(item => `${item.rank}. ${item.label} — score ${item.analysis.summary.score}/10, cash flow ${asCurrency(item.analysis.summary.monthlyCashFlow)}/mo`).join('\n') }], structuredContent: comparison };
}

function defaultClient() {
  const clientId = process.env.DEFAULT_OAUTH_CLIENT_ID || 'chatgpt-dev-client';
  if (!oauthClients.has(clientId)) {
    oauthClients.set(clientId, {
      client_id: clientId,
      client_secret: process.env.DEFAULT_OAUTH_CLIENT_SECRET || null,
      redirect_uris: (process.env.DEFAULT_OAUTH_REDIRECT_URIS || '').split(',').map(v => v.trim()).filter(Boolean),
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'none',
      scope: 'openid profile email deals.read deals.write'
    });
  }
}
defaultClient();

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/' }), (req, res) => {
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
  const { response_type, client_id, redirect_uri, state, scope, code_challenge, code_challenge_method } = req.query;
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
  try { res.json(calculateDeal(req.body || {})); } catch (error) { res.status(500).json({ error: error.message || 'Failed to analyze deal.' }); }
});
app.post('/parse-listing', async (req, res) => {
  try { res.json(await parseListing(req.body || {})); } catch (error) { res.status(500).json({ error: error.message || 'Failed to parse listing.' }); }
});
app.post('/compare', (req, res) => {
  try { res.json(compareDeals(req.body?.deals || [])); } catch (error) { res.status(500).json({ error: error.message || 'Failed to compare deals.' }); }
});
app.post('/saveDeal', (req, res) => {
  try {
    const user = sessionOrBearerUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    const analysis = calculateDeal(req.body || {});
    const id = saveDealRecord(req.body || {}, analysis, user.id);
    res.json({ id, analysis, user: { id: user.id, email: user.email } });
  } catch (error) { res.status(500).json({ error: error.message || 'Failed to save deal.' }); }
});
app.get('/deals', (req, res) => {
  try {
    const user = sessionOrBearerUser(req);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    res.json(getSavedDeals(user.id));
  } catch (error) { res.status(500).json({ error: error.message || 'Failed to get deals.' }); }
});
app.get('/dashboard', (req, res) => {
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
        if (!user) return res.status(401).json(jsonRpcError(id, 401, 'Authentication required'));
        if (name === 'saveDeal') {
          const analysis = calculateDeal(args);
          const savedId = saveDealRecord(args, analysis, user.id);
          return res.json(jsonRpc(id, { content: [{ type: 'text', text: 'Deal saved successfully' }], structuredContent: { id: savedId, ...analysis } }));
        }
        const deals = getSavedDeals(user.id);
        return res.json(jsonRpc(id, { content: [{ type: 'text', text: `Found ${deals.length} deals` }], structuredContent: deals }));
      }
      return res.json(jsonRpcError(id, -32601, 'Unknown tool'));
    }
    return res.json(jsonRpcError(id, -32601, 'Unknown method'));
  } catch (error) {
    return res.json(jsonRpcError(id, -32000, error.message || 'Server error'));
  }
});

app.listen(PORT, () => {
  console.log(`${APP_NAME} listening on port ${PORT}`);
});