import express, { type Request } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { v4 as uuidv4 } from 'uuid';
import { db, oauthClients, oauthCodes, oauthAccessTokens, oauthRefreshTokens, getUserById, createUser, getOrCreateAnonymousOAuthUser } from './db';
import { baseUrl, queryParam, randomToken, sha256base64url, configuredSecret, PUBLIC_BASE_URL } from './utils';
import type { AppUser } from './types';

// ── Auth helpers ──────────────────────────────────────────────────────────────

export function currentUser(req: Request): AppUser | null {
  return req.user || null;
}

export function bearerUser(req: Request): AppUser | null {
  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length);
  const tokenRow = oauthAccessTokens.get(token);
  if (!tokenRow || (tokenRow.expiresAt ?? 0) < Date.now()) return null;
  return getUserById(tokenRow.userId);
}

export function sessionOrBearerUser(req: Request): AppUser | null {
  return currentUser(req) || bearerUser(req);
}

// ── Passport setup ────────────────────────────────────────────────────────────

const googleAuthConfigured = configuredSecret(process.env.GOOGLE_CLIENT_ID) && configuredSecret(process.env.GOOGLE_CLIENT_SECRET);
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || (PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/auth/google/callback` : '/auth/google/callback');

if (googleAuthConfigured) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackURL: GOOGLE_CALLBACK_URL
  }, (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value ?? null;
      const displayName = profile.displayName || email || 'User';
      const user = createUser(profile.id, email, displayName);
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  try {
    done(null, getUserById(String(id)));
  } catch (error) {
    done(error);
  }
});

export { googleAuthConfigured };

const SUPPORTED_TOKEN_AUTH_METHODS = new Set(['none', 'client_secret_post', 'client_secret_basic']);

function protectedResourceUrl(req: Request) {
  return `${baseUrl(req)}/mcp`;
}

function normalizeTokenAuthMethod(value: unknown) {
  const method = queryParam(value) || 'none';
  return SUPPORTED_TOKEN_AUTH_METHODS.has(method) ? method : 'none';
}

function parseBasicClientAuth(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return null;
    return {
      clientId: decoded.slice(0, separatorIndex),
      clientSecret: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}

function opaqueQueryParam(req: Request, name: string) {
  const originalUrl = req.originalUrl || req.url;
  const queryIndex = originalUrl.indexOf('?');
  if (queryIndex === -1) return '';

  for (const part of originalUrl.slice(queryIndex + 1).split('&')) {
    if (!part) continue;
    const separatorIndex = part.indexOf('=');
    const rawKey = separatorIndex === -1 ? part : part.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? '' : part.slice(separatorIndex + 1);

    try {
      if (decodeURIComponent(rawKey.replace(/\+/g, '%20')) !== name) continue;
      return decodeURIComponent(rawValue);
    } catch {
      if (rawKey === name) return rawValue;
    }
  }

  return '';
}

// ── Default OAuth client ──────────────────────────────────────────────────────

export function ensureDefaultClient(port: number) {
  const clientId = process.env.DEFAULT_OAUTH_CLIENT_ID || 'chatgpt-dev-client';
  if (!oauthClients.has(clientId)) {
    const fallbackRedirectUri = PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/dashboard` : `http://localhost:${port}/dashboard`;
    const tokenMethod = normalizeTokenAuthMethod(process.env.DEFAULT_OAUTH_TOKEN_ENDPOINT_AUTH_METHOD);
    oauthClients.set(clientId, {
      client_id: clientId,
      client_secret: tokenMethod === 'none' ? '' : (process.env.DEFAULT_OAUTH_CLIENT_SECRET || ''),
      redirect_uris: (process.env.DEFAULT_OAUTH_REDIRECT_URIS || fallbackRedirectUri).split(',').map(v => v.trim()).filter(Boolean),
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: tokenMethod,
      scope: 'openid profile email deals.read deals.write'
    });
  }
}

// ── OAuth router ──────────────────────────────────────────────────────────────

export const oauthRouter = express.Router();

// CORS for OAuth endpoints — token exchange may be initiated from browser context
oauthRouter.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const authServerMeta = (req: Request) => {
  const origin = baseUrl(req);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
    resource_parameter_supported: true,
    scopes_supported: ['openid', 'profile', 'email', 'deals.read', 'deals.write']
  };
};

const protectedResourceMeta = (req: Request) => {
  const origin = baseUrl(req);
  return {
    resource: protectedResourceUrl(req),
    authorization_servers: [origin],
    bearer_methods_supported: ['header', 'query'],
    scopes_supported: ['deals.read', 'deals.write']
  };
};

oauthRouter.get('/.well-known/oauth-authorization-server', (req, res) => res.json(authServerMeta(req)));
oauthRouter.get('/.well-known/oauth-protected-resource', (req, res) => res.json(protectedResourceMeta(req)));
// RFC 9728 alternative: /.well-known/oauth-protected-resource/{path}
oauthRouter.get('/.well-known/oauth-protected-resource/mcp', (req, res) => res.json(protectedResourceMeta(req)));
oauthRouter.get('/mcp/.well-known/oauth-protected-resource', (req, res) => res.json(protectedResourceMeta(req)));
oauthRouter.get('/mcp/.well-known/oauth-authorization-server', (req, res) => res.json(authServerMeta(req)));
// OpenID Connect discovery (some clients fall back to this)
oauthRouter.get('/.well-known/openid-configuration', (req, res) => res.json(authServerMeta(req)));

oauthRouter.post('/register', (req, res) => {
  const redirectUris = Array.isArray(req.body.redirect_uris) ? req.body.redirect_uris : [];
  const tokenMethod = normalizeTokenAuthMethod(req.body.token_endpoint_auth_method);
  const clientId = `client_${uuidv4()}`;
  const client = {
    client_id: clientId,
    client_secret: tokenMethod === 'none' ? '' : randomToken(),
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: tokenMethod,
    scope: req.body.scope || 'openid profile email deals.read deals.write',
    client_name: req.body.client_name || 'Dynamic client'
  };
  oauthClients.set(clientId, client);
  res.status(201).json(client);
});

oauthRouter.get('/authorize', (req, res) => {
  const response_type = queryParam(req.query.response_type);
  const client_id = queryParam(req.query.client_id);
  const redirect_uri = queryParam(req.query.redirect_uri);
  const state = opaqueQueryParam(req, 'state');
  const scope = queryParam(req.query.scope);
  const resource = queryParam(req.query.resource) || protectedResourceUrl(req);
  const code_challenge = queryParam(req.query.code_challenge);
  const code_challenge_method = queryParam(req.query.code_challenge_method);
  const client = oauthClients.get(client_id);
  console.log(`[authorize] client=${client_id} found=${!!client} redirect_uri=${redirect_uri} resource=${resource} registered=${JSON.stringify(client?.redirect_uris)}`);
  if (!client) return res.status(400).send('Unknown client_id');
  if (response_type !== 'code') return res.status(400).send('Unsupported response_type');
  if (!redirect_uri || !client.redirect_uris.includes(redirect_uri)) return res.status(400).send('Invalid redirect_uri');
  if (code_challenge && code_challenge_method !== 'S256') return res.status(400).send('Unsupported code_challenge_method, use S256');
  if (!req.user) {
    // Auto-issue guest token immediately — any HTML page breaks ChatGPT's OAuth
    // session window. Users wanting their Google account should log in on the website
    // first; that session cookie then carries through /authorize automatically.
    const anonUser = getOrCreateAnonymousOAuthUser();
    const code = randomToken();
    oauthCodes.set(code, {
      client_id, redirect_uri, userId: anonUser.id,
      scope: scope || 'openid profile email deals.read deals.write',
      code_challenge,
      resource,
      expiresAt: Date.now() + 10 * 60 * 1000
    });
    const redirect = new URL(redirect_uri);
    redirect.searchParams.set('code', code);
    if (state) redirect.searchParams.set('state', state);
    console.log(`[authorize] issuing guest code`);
    return res.redirect(redirect.toString());
  }
  const code = randomToken();
  oauthCodes.set(code, {
    client_id, redirect_uri, userId: req.user.id,
    scope: scope || 'openid profile email deals.read deals.write',
    code_challenge,
    resource,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
  const redirect = new URL(redirect_uri);
  redirect.searchParams.set('code', code);
  if (state) redirect.searchParams.set('state', state);
  res.redirect(redirect.toString());
});

oauthRouter.post('/token', (req, res) => {
  console.log(`[token] body=${JSON.stringify(req.body)} auth=${req.headers.authorization?.slice(0,20)}`);
  const grantType = req.body.grant_type;
  const requestedResource = queryParam(req.body.resource);
  const basicAuth = parseBasicClientAuth(typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined);
  const clientSecret = basicAuth?.clientSecret ?? req.body.client_secret;
  const clientAuthMethod = basicAuth ? 'client_secret_basic' : (req.body.client_secret ? 'client_secret_post' : 'none');

  // Some clients (e.g. OpenAI's platform) omit client_id from the token request body.
  // Fall back to the token/code record when needed.
  let clientId = queryParam(req.body.client_id) || basicAuth?.clientId || '';
  if (!clientId && grantType === 'authorization_code') {
    const peek = oauthCodes.get(req.body.code);
    clientId = peek?.client_id || '';
  }
  if (!clientId && grantType === 'refresh_token') {
    const peek = oauthRefreshTokens.get(req.body.refresh_token);
    clientId = peek?.client_id || '';
  }

  const client = oauthClients.get(clientId);
  console.log(`[token] grant=${grantType} client=${clientId} auth_method=${clientAuthMethod} resource=${requestedResource || '-'} client_found=${!!client}`);
  if (!client) return res.status(400).json({ error: 'invalid_client', error_description: `Unknown client: ${clientId}` });
  if (client.token_endpoint_auth_method !== 'none' && client.client_secret !== clientSecret) {
    return res.status(400).json({ error: 'invalid_client', error_description: 'Bad client secret' });
  }
  const ACCESS_TTL = 30 * 24 * 3600 * 1000;
  if (grantType === 'authorization_code') {
    const record = oauthCodes.get(req.body.code);
    console.log(`[token] code_found=${!!record} stored_redirect=${record?.redirect_uri} got_redirect=${req.body.redirect_uri} stored_resource=${record?.resource || '-'} got_resource=${requestedResource || '-'} redirect_uri_match=${record?.redirect_uri === req.body.redirect_uri}`);
    if (!record || record.expiresAt < Date.now()) return res.status(400).json({ error: 'invalid_grant', error_description: 'Code not found or expired' });
    if (record.client_id !== clientId || record.redirect_uri !== req.body.redirect_uri) return res.status(400).json({ error: 'invalid_grant', error_description: `client_id or redirect_uri mismatch: stored=${record.redirect_uri} got=${req.body.redirect_uri}` });
    if (record.resource && requestedResource && record.resource !== requestedResource) return res.status(400).json({ error: 'invalid_grant', error_description: `resource mismatch: stored=${record.resource} got=${requestedResource}` });
    if (record.code_challenge && (!req.body.code_verifier || sha256base64url(req.body.code_verifier) !== record.code_challenge)) return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
    oauthCodes.delete(req.body.code);
    const accessToken = randomToken();
    const refreshToken = randomToken();
    oauthAccessTokens.set(accessToken, { userId: record.userId, client_id: clientId, scope: record.scope, resource: record.resource, expiresAt: Date.now() + ACCESS_TTL });
    oauthRefreshTokens.set(refreshToken, { userId: record.userId, client_id: clientId, scope: record.scope, resource: record.resource });
    return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL / 1000, refresh_token: refreshToken, scope: record.scope });
  }
  if (grantType === 'refresh_token') {
    const record = oauthRefreshTokens.get(req.body.refresh_token);
    if (!record || record.client_id !== clientId) return res.status(400).json({ error: 'invalid_grant' });
    const accessToken = randomToken();
    if (record.resource && requestedResource && record.resource !== requestedResource) return res.status(400).json({ error: 'invalid_grant', error_description: `resource mismatch: stored=${record.resource} got=${requestedResource}` });
    oauthAccessTokens.set(accessToken, { userId: record.userId, client_id: clientId, scope: record.scope, resource: record.resource, expiresAt: Date.now() + ACCESS_TTL });
    return res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL / 1000, refresh_token: req.body.refresh_token, scope: record.scope });
  }
  return res.status(400).json({ error: 'unsupported_grant_type' });
});

// Auth routes (Google OAuth for web)
oauthRouter.get('/auth/google', (req, res, next) => {
  if (!googleAuthConfigured) return res.status(503).send('Google OAuth is not configured');
  if (req.query.returnTo) req.session.returnTo = String(req.query.returnTo);
  return passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});
oauthRouter.get('/auth/google/callback', (req, res, next) => {
  if (!googleAuthConfigured) return res.status(503).send('Google OAuth is not configured');
  return passport.authenticate('google', { failureRedirect: '/', keepSessionInfo: true })(req, res, next);
}, (req, res) => {
  const returnTo = req.session.returnTo || '/dashboard';
  delete req.session.returnTo;
  res.redirect(returnTo);
});
oauthRouter.get('/logout', (req, res) => {
  req.logout(() => req.session.destroy(() => res.redirect('/')));
});
oauthRouter.get('/whoami', (req, res) => {
  res.json(currentUser(req) || bearerUser(req) || null);
});

// Inline user type access for debug
export { db };
