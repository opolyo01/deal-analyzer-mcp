# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev:all      # Express on :3000 + Vite on :5173 (recommended)
npm run check        # Backend TypeScript check
npm run check:client # Frontend TypeScript check
npm run eval         # Manual smoke-test against localhost
```

There are no automated tests.

## Architecture

One Express server (`src/server.ts`) serves the React SPA, the REST API, and the MCP endpoint simultaneously. In dev, Vite proxies all API paths to `:3000`; in production Express serves `client-dist/` directly.

Everything persists to a single SQLite file (`deals.db`). `src/db.ts` owns all DB access and runs inline schema migrations on startup — OAuth clients, tokens, sessions, users, and deals all live in the same file.

The OAuth 2.0 Authorization Server (`src/oauth.ts`) is fully self-contained. Claude.ai and ChatGPT self-register via `POST /register`, then go through `/authorize` → `/token`. `/authorize` auto-approves without a consent screen — the user "connects" explicitly in ChatGPT/Claude settings. Google OAuth (`/auth/google`) is separate and only used for web app login.

`src/deal.ts` is pure computation with no DB or network access. It estimates missing inputs (taxes, insurance, rent) from state-level lookup tables, then scores the deal 1–10.

## Quirks

- **Root path rewrite** (`server.ts:71-82`): ChatGPT sends `POST /` for token exchange instead of `POST /token`. Middleware rewrites the path before routing hits.
- **`opaqueQueryParam`** (`oauth.ts:87-107`): Custom raw URL parser for the OAuth `state` parameter only — avoids Express double-decoding percent-encoded values.
- **Anonymous OAuth user**: `/authorize` without a session creates/reuses a single `oauth-anonymous` DB user instead of blocking, so AI clients can get tokens before the user signs in with Google.
