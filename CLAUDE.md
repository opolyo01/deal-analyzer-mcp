# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (recommended — backend + frontend together)
npm run dev:all          # Express on :3000 + Vite on :5173

# Run separately
npm run dev              # Express only
npm run dev:client       # Vite only

# Type checking
npm run check            # Backend TypeScript (no emit)
npm run check:client     # Frontend TypeScript

# Production build
npm run build            # Builds client → client-dist/, server → dist/
npm start                # Run compiled server

# Eval / smoke test
npm run eval             # Run src/eval.ts against localhost
npm run eval:prod        # Run against production Railway URL
```

There are no automated tests. `src/eval.ts` is the manual smoke-test runner.

## Architecture

**Single Express server** (`src/server.ts`) serves three things simultaneously:
1. The React SPA (built output from `client-dist/`)
2. A REST API for the web app (`/analyze`, `/saveDeal`, `/deals`, etc.)
3. An MCP endpoint (`/mcp`) for Claude.ai and ChatGPT tool integrations

**Frontend** (`client/`) is a Vite + React 19 + Tailwind SPA. In dev mode Vite proxies all API paths to `:3000`. In production Express serves `client-dist/` directly. The client uses `client/src/lib/api.ts` for all fetch calls (no external HTTP library, just `fetch` with `credentials: 'same-origin'`).

**SQLite database** (`deals.db`, via `better-sqlite3`) stores deals, users, OAuth clients, OAuth tokens, and sessions — all in one file. `src/db.ts` owns all DB access and runs inline migrations on startup.

**OAuth 2.0 Authorization Server** (`src/oauth.ts`) is fully self-contained in the process. It implements:
- RFC 8414 authorization server metadata (`/.well-known/oauth-authorization-server`)
- RFC 7591 dynamic client registration (`POST /register`)
- RFC 9728 protected resource metadata (`/.well-known/oauth-protected-resource`, multiple path variants)
- PKCE (S256 only), auth code flow, refresh token flow
- Google OAuth for web app sign-in (separate from MCP auth)

Claude.ai and ChatGPT self-register as OAuth clients, then go through `/authorize` → `/token` to get Bearer tokens. The `/authorize` endpoint auto-approves without a consent UI — users "connect" explicitly in ChatGPT/Claude settings.

**MCP handler** (`src/mcp.ts`) speaks JSON-RPC 2.0. It handles both plain JSON and SSE (`text/event-stream`) response formats. Read-only tools (`analyzeDeal`, `parseListing`, `analyzeListing`, `compareDeals`) require no auth. Write tools (`saveDeal`, `getDeals`) require OAuth Bearer tokens with `deals.write` / `deals.read` scopes.

**Deal scoring engine** (`src/deal.ts`) is pure computation — no DB or network. It estimates missing inputs (taxes, insurance, rent) from state-level lookup tables, then calculates cash flow, cap rate, CoC return, DSCR, and a 1–10 score. `parseListing` fetches Zillow/Redfin pages via axios + cheerio.

## Key Env Vars

| Variable | Purpose |
|---|---|
| `PUBLIC_BASE_URL` | Canonical origin (e.g. `https://deal-analyzer-mcp-production.up.railway.app`). Required in production for OAuth redirect URLs. |
| `SESSION_SECRET` | Express session signing key |
| `DATABASE_PATH` | Override SQLite file path |
| `ALLOW_ANONYMOUS_MODE` | `true` enables unauthenticated saves; only works when `PUBLIC_BASE_URL` is localhost |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth for web login |
| `DEFAULT_OAUTH_CLIENT_ID` / `DEFAULT_OAUTH_REDIRECT_URIS` | Pre-registered client for ChatGPT/Claude |
| `DEFAULT_OAUTH_TOKEN_ENDPOINT_AUTH_METHOD` | `none`, `client_secret_post`, or `client_secret_basic` |

## Deployment

Deployed on Railway with auto-deploy from `main` via `.github/workflows/deploy-railway.yml`. The workflow typechecks, deploys with `railway up`, then smoke-tests `/health` and the MCP `tools/list` endpoint.

## Quirks

- **Root path rewrite** (`server.ts:71-82`): ChatGPT sends `POST /` for token exchange instead of `POST /token`. The middleware rewrites the path before routing.
- **`opaqueQueryParam`** (`oauth.ts:87-107`): Custom raw URL query parser used only for the OAuth `state` parameter to avoid Express double-decoding percent-encoded values.
- **Anonymous OAuth user**: When `/authorize` is hit without a session, it creates/reuses a single `oauth-anonymous` user in the DB rather than blocking. This lets AI clients get tokens before the user has signed in with Google.
- **Session store**: SQLite-backed (`SqliteSessionStore` in `db.ts`) so sessions survive server restarts and work across Railway replicas sharing a volume.
