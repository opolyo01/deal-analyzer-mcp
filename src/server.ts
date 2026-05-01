import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import fs from 'node:fs';
import path from 'node:path';
import { db, dbPath, getSavedDealById, getSavedDeals, saveDealRecord, isProUser, countDeals, SqliteSessionStore } from './db';
import { calculateDeal, parseListing, compareDeals } from './deal';
import { billingRouter } from './billing';
import { oauthRouter, sessionOrBearerUser, googleAuthConfigured, ensureDefaultClient } from './oauth';
import { mcpRouter } from './mcp';
import { APP_NAME, APP_VERSION, ALLOW_ANONYMOUS_MODE, errorMessage, baseUrl } from './utils';

const projectRoot = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 3000);
const publicDir = path.join(projectRoot, 'public');
const clientDistPath = path.join(projectRoot, 'client-dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(clientDistPath, { index: false }));
app.use(session({
  store: new SqliteSessionStore(),
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto' }
}));
app.use(passport.initialize());
app.use(passport.session());

// ── Routers ───────────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  if (req.path === '/favicon.ico') return next();
  const oauthPaths = new Set(['/authorize', '/token', '/register', '/mcp']);
  const isOauth = oauthPaths.has(req.path) || req.path.includes('well-known');
  const qs = isOauth && Object.keys(req.query).length ? ' ?' + new URLSearchParams(req.query as Record<string, string>).toString().slice(0, 200) : '';
  const body = isOauth && req.method === 'POST' ? ` body=${JSON.stringify(req.body).slice(0, 200)}` : '';
  console.log(`[req] ${req.method} ${req.path}${qs}${body}`);
  const origSend = res.send.bind(res);
  (res as any).send = (chunk: any) => {
    if (isOauth && res.statusCode >= 400) {
      const preview = typeof chunk === 'string' ? chunk.slice(0, 150) : JSON.stringify(chunk).slice(0, 150);
      console.log(`[res] ${req.method} ${req.path} → ${res.statusCode} ${preview}`);
    }
    return origSend(chunk);
  };
  next();
});

// Rewrite root-path requests (Claude.ai registers without /mcp suffix;
// ChatGPT sends token exchange to POST / instead of POST /token)
app.use((req, _res, next) => {
  if (req.path !== '/') return next();
  if (req.method === 'POST' && req.body?.grant_type) {
    req.url = '/token';
  } else if (
    ['POST', 'DELETE'].includes(req.method) ||
    (req.method === 'GET' && req.headers.accept?.includes('application/json'))
  ) {
    req.url = '/mcp';
  }
  next();
});

app.use(oauthRouter);
app.use(mcpRouter);
app.use(billingRouter);

ensureDefaultClient(PORT);

function sendClientApp(res: express.Response) {
  if (fs.existsSync(clientIndexPath)) return res.sendFile(clientIndexPath);
  return res.type('html').status(503).send('<html><body><h2>Client build missing</h2></body></html>');
}

// ── Web routes ────────────────────────────────────────────────────────────────

app.get('/privacy', (_req, res) => res.sendFile(path.join(publicDir, 'privacy.html')));
app.get('/terms', (_req, res) => res.sendFile(path.join(publicDir, 'terms.html')));
app.get(['/', '/index.html'], (_req, res) => sendClientApp(res));
app.get(['/quick-check', '/deal-widget.html'], (_req, res) => sendClientApp(res));
app.get(['/dashboard', '/dashboard/*', '/deals.html'], (_req, res) => sendClientApp(res));
app.get(['/add', '/add/*', '/add.html'], (_req, res) => sendClientApp(res));
app.get(['/agent', '/agent.html'], (_req, res) => res.redirect('/'));
app.use(express.static(publicDir, { index: false }));

app.get('/health', (_req, res) => res.json({ ok: true, app: APP_NAME, version: APP_VERSION }));
app.get('/debug/auth', (req, res) => {
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const tokenRow = token ? (() => { try { return db.prepare('SELECT * FROM oauth_tokens WHERE token = ? AND type = ?').get(token, 'access') as any; } catch { return 'db-error'; } })() : null;
  const userCount = (() => { try { return (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c; } catch { return 'db-error'; } })();
  const tokenCount = (() => { try { return (db.prepare('SELECT COUNT(*) as c FROM oauth_tokens').get() as any).c; } catch { return 'db-error'; } })();
  res.json({
    version: APP_VERSION, dbPath, googleAuthConfigured,
    anonymousModeEnabled: ALLOW_ANONYMOUS_MODE,
    signedIn: Boolean(sessionOrBearerUser(req)),
    userCount, tokenCount,
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
const FREE_DEAL_LIMIT = 3;

app.post('/saveDeal', (req, res) => {
  try {
    const user = sessionOrBearerUser(req);
    if (!user && !ALLOW_ANONYMOUS_MODE) return res.status(401).json({ error: 'login_required', loginUrl: '/auth/google' });
    if (user && !isProUser(user.id) && countDeals(user.id) >= FREE_DEAL_LIMIT) {
      return res.status(402).json({ error: 'upgrade_required', message: `Free plan is limited to ${FREE_DEAL_LIMIT} saved deals.`, upgradeUrl: '/billing/checkout' });
    }
    const analysis = calculateDeal(req.body || {});
    const id = saveDealRecord(req.body || {}, analysis, user ? user.id : null);
    res.json({ id, analysis, user: user ? { id: user.id, email: user.email } : null });
  } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to save deal.') }); }
});

app.get('/deals', (req, res) => {
  try {
    const user = sessionOrBearerUser(req);
    if (!user && !ALLOW_ANONYMOUS_MODE) return res.json([]);
    res.json(getSavedDeals(user ? user.id : null));
  } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to get deals.') }); }
});
app.get('/deals/:id', (req, res) => {
  try {
    const user = sessionOrBearerUser(req);
    if (!user && !ALLOW_ANONYMOUS_MODE) return res.status(401).json({ error: 'login_required', loginUrl: '/auth/google' });
    const deal = getSavedDealById(req.params.id, user ? user.id : null);
    if (!deal) return res.status(404).json({ error: 'not found' });
    res.json(deal);
  } catch (error) { res.status(500).json({ error: errorMessage(error, 'Failed to get deal.') }); }
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

app.listen(PORT, () => console.log(`${APP_NAME} listening on port ${PORT}`));
