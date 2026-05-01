# Deal Analyzer MCP

Full-stack real estate deal analysis app with a React frontend, Express backend, SQLite persistence, listing parsing, and MCP support for Claude.ai and ChatGPT.

## Overview

Core capabilities:
- Analyze rental deals with cash flow, cap rate, cash-on-cash return, DSCR, and BUY / HOLD / PASS scoring
- Parse Zillow and Redfin listings
- Save, rank, compare, and delete deals
- Serve a React app for the full UI
- Expose MCP tooling and OAuth flows for Claude.ai / ChatGPT integrations
- Keep `privacy.html` and `terms.html` as static pages for store/app requirements

## Current App Routes

React app routes:
- `/` — home / landing page
- `/quick-check` — lightweight deal check
- `/add` — full analysis page
- `/dashboard` — saved deals and comparison UI

Legacy aliases that still resolve to the React app:
- `/index.html`
- `/deal-widget.html`
- `/add.html`
- `/deals.html`

Static pages served from `public/`:
- `/privacy`
- `/terms`

## Project Structure

```text
client/       React + Vite + TypeScript + Tailwind frontend
src/          Express server, MCP routes, OAuth, scoring engine, DB access
public/       Static assets plus privacy/terms HTML
client-dist/  Built frontend output
dist/         Built server output
deals.db      SQLite database
```

## Local Development

Requirements:
- Node.js 20+

Install dependencies:

```bash
npm install
npm --prefix client install
```

Recommended: run both backend and frontend together.

```bash
npm run dev:all
```

That starts:
- Express on `http://localhost:3000`
- Vite on `http://localhost:5173`

Use `http://localhost:5173` when you want frontend hot reload.

You can also run them separately:

```bash
npm run dev
npm run dev:client
```

Notes:
- `npm run dev` only starts Express.
- `npm run dev:client` only starts the Vite dev server.
- Vite proxies API/auth requests to the backend on port `3000`.

## Production-Style Local Run

Build both the frontend and backend:

```bash
npm run build
```

Start the compiled server:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Scripts

Root scripts:

```bash
npm run dev         # Express dev server
npm run dev:client  # Vite dev server
npm run dev:all     # Express + Vite together
npm run check       # Backend TypeScript check
npm run check:client
npm run build       # Build client + server
npm run build:client
npm run start       # Run compiled server
```

Client-only scripts:

```bash
npm --prefix client run dev
npm --prefix client run check
npm --prefix client run build
```

## API Endpoints

Main app endpoints:
- `POST /analyze`
- `POST /parse-listing`
- `POST /compare`
- `POST /saveDeal`
- `GET /deals`
- `DELETE /deals/:id`
- `GET /health`

Auth / session:
- `GET /whoami`
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /logout`

MCP / app metadata:
- `GET /mcp`
- `POST /mcp`
- `DELETE /mcp`
- `GET /.well-known/app.json`
- `GET /.well-known/openai-apps-challenge`
- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource`

## MCP Tools

Available MCP capabilities include:
- `analyzeDeal`
- `parseListing`
- `analyzeListing`
- `compareDeals`
- `saveDeal`
- `getDeals`

## Environment Notes

Common environment variables:
- `PORT`
- `PUBLIC_BASE_URL`
- `DATABASE_PATH`
- `SESSION_SECRET`
- `ALLOW_ANONYMOUS_MODE`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- `DEFAULT_OAUTH_CLIENT_ID`
- `DEFAULT_OAUTH_CLIENT_SECRET`
- `DEFAULT_OAUTH_TOKEN_ENDPOINT_AUTH_METHOD` — `none`, `client_secret_post`, or `client_secret_basic`
- `DEFAULT_OAUTH_REDIRECT_URIS`

OAuth submission note:
- For ChatGPT app submission, add the production redirect URI shown in the OpenAI app management page to `DEFAULT_OAUTH_REDIRECT_URIS` or your authorization server allowlist. This can differ from the redirect used during ChatGPT developer-mode MCP testing.

## Deployment

Railway works well for the current setup:

1. Create a new Railway project
2. Deploy from this GitHub repository
3. Set required environment variables
4. Run the standard build/start flow

App behavior in production:
- Express serves the built React app from `client-dist/`
- `privacy.html` and `terms.html` remain static
- SQLite persists locally unless `DATABASE_PATH` points elsewhere

## Automated Deploys

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-railway.yml` that deploys to Railway on every push to `main`.

Required GitHub secret:
- `RAILWAY_TOKEN` — Railway project token scoped to the production environment

Optional GitHub secrets:
- `RAILWAY_PROJECT_ID` — only needed if the token alone is not enough to target the correct project
- `RAILWAY_ENVIRONMENT_NAME` — only needed if you want to force a specific Railway environment such as `production`

The workflow:
- installs dependencies
- runs backend and client typechecks
- deploys with `railway up`
- smoke tests the live `/health` endpoint plus unauthenticated MCP `tools/list` and `analyzeDeal`

## Status

Current state:
- Full React frontend migration completed
- Legacy HTML app pages removed
- Static `privacy` and `terms` retained
- Express + Vite local workflow documented
- Build and typecheck passing
