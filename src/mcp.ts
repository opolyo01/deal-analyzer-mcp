import express, { type Request } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { calculateDeal, parseListing, compareDeals, mergeListingWithOverrides, asCurrency } from './deal';
import { getSavedDeals, saveDealRecord, dbPath } from './db';
import { sessionOrBearerUser } from './oauth';
import { errorMessage, APP_NAME, APP_VERSION, ALLOW_ANONYMOUS_MODE, baseUrl } from './utils';
import type { JsonRecord } from './types';

// ── MCP tool definitions ──────────────────────────────────────────────────────

export const tools = [
  {
    name: 'analyzeDeal',
    title: 'Analyze real estate deal',
    description: 'Underwrite a rental property and score it 1-10. Only price is required — rent, taxes, and insurance are estimated when omitted. Accepts: price, rent, taxes (annual), insurance (annual), hoa (monthly), rentComps, city/state/address, otherMonthlyCosts, vacancyRate, repairsRate, capexRate, managementRate, downPaymentPercent, rate, termYears, propertyType, label. Returns score, recommendation (BUY/HOLD/PASS), monthly cash flow, cap rate, cash-on-cash return, break-even rent, estimated inputs, market-rent range, and risks/strengths.',
    inputSchema: { type: 'object', additionalProperties: true, properties: { price: { type: 'number', description: 'Purchase price in dollars' }, rent: { type: 'number', description: 'Monthly rent in dollars. Estimated from market heuristics or rentComps if omitted.' }, rentComps: { type: 'array', description: 'Optional current rental comps with rent, beds, baths, sqft, distanceMiles, source, and address', items: { type: 'object', additionalProperties: true } }, taxes: { type: 'number', description: 'Annual property taxes in dollars. Estimated from location if omitted.' }, insurance: { type: 'number', description: 'Annual insurance in dollars. Estimated from property type and location if omitted.' }, hoa: { type: 'number', description: 'Monthly HOA fee' }, downPaymentPercent: { type: 'number', description: 'Down payment as decimal, e.g. 0.20 for 20%' }, rate: { type: 'number', description: 'Annual interest rate as decimal, e.g. 0.065' }, propertyType: { type: 'string' }, label: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, state: { type: 'string', description: 'Two-letter state code' } }, required: ['price'] }
  },
  {
    name: 'parseListing',
    title: 'Parse listing',
    description: 'Extract fields (price, rent, taxes, HOA, address, property type, photo) from a Zillow or Redfin URL or raw listing text.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, listingText: { type: 'string' } } }
  },
  {
    name: 'analyzeListing',
    title: 'Parse and analyze listing',
    description: 'Parse a Zillow or Redfin listing URL or text, then immediately underwrite it. Pass any additional known fields (rent, taxes, etc.) alongside the url to override parsed values. Best single tool when the user shares a listing link.',
    inputSchema: { type: 'object', additionalProperties: true, properties: { url: { type: 'string' }, listingText: { type: 'string' } } }
  },
  {
    name: 'compareDeals',
    title: 'Compare multiple deals',
    description: 'Rank multiple deals side by side by score and cash flow. Each deal in the array accepts the same fields as analyzeDeal.',
    inputSchema: { type: 'object', properties: { deals: { type: 'array', minItems: 2, items: { type: 'object' } } }, required: ['deals'] }
  },
  {
    name: 'saveDeal',
    title: 'Save deal',
    description: "Persist a deal to the signed-in user's account so it appears on the dashboard. Accepts the same fields as analyzeDeal. Requires the user to be authenticated.",
    inputSchema: { type: 'object', additionalProperties: true, properties: { label: { type: 'string' }, price: { type: 'number' }, rent: { type: 'number' } }, required: ['price'] }
  },
  {
    name: 'getDeals',
    title: 'Get saved deals',
    description: 'Retrieve all saved deals for the currently signed-in user.',
    inputSchema: { type: 'object', properties: {} }
  }
];

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

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
  return { content: [{ type: 'text', text: lines.join('\n') }], structuredContent: { ...result, ...extra } };
}

function buildCompareToolResult(comparison: ReturnType<typeof compareDeals>) {
  return {
    content: [{ type: 'text', text: comparison.analyses.map(item => `${item.rank}. ${item.label} — score ${item.analysis.summary.score}/10, cash flow after debt ${asCurrency(item.analysis.summary.monthlyCashFlow)}/mo`).join('\n') }],
    structuredContent: comparison
  };
}

// ── Request handler ───────────────────────────────────────────────────────────

async function handleMcpRequest(req: Request, res: express.Response) {
  const user = sessionOrBearerUser(req);
  if (!user && !ALLOW_ANONYMOUS_MODE) {
    const origin = baseUrl(req);
    res.setHeader('WWW-Authenticate', `Bearer realm="${origin}", resource_metadata="${origin}/mcp/.well-known/oauth-protected-resource"`);
    return res.status(401).json({ error: 'unauthorized', error_description: 'Bearer token required' });
  }

  const body = Array.isArray(req.body) ? req.body : [req.body || {}];
  const authHeader = req.headers.authorization || '(none)';
  const tokenPreview = authHeader.startsWith('Bearer ') ? authHeader.slice(7, 16) + '…' : authHeader;
  const isBatch = Array.isArray(req.body);
  const results: unknown[] = [];

  for (const msg of body) {
    const { id, method, params } = msg;
    console.log(`[mcp] method=${method} tool=${params?.name ?? '-'} auth=${tokenPreview}`);
    try {
      if (method === 'initialize') {
        const sessionId = uuidv4();
        const result = jsonRpc(id, { protocolVersion: '2025-03-26', serverInfo: { name: APP_NAME, version: APP_VERSION }, capabilities: { tools: {} } });
        if (!isBatch) { mcpSend(res, result, sessionId); return; }
        res.setHeader('Mcp-Session-Id', sessionId);
        results.push(result); continue;
      }
      if (method === 'notifications/initialized') { results.push(null); continue; }
      if (method === 'ping') { results.push(jsonRpc(id, {})); continue; }
      if (method === 'tools/list') { results.push(jsonRpc(id, { tools })); continue; }
      if (method === 'tools/call') {
        const name = params?.name;
        const args = params?.arguments || {};
        let result: unknown;
        if (name === 'analyzeDeal') {
          result = jsonRpc(id, buildAnalyzeToolResult(calculateDeal(args)));
        } else if (name === 'parseListing') {
          const parsed = await parseListing(args);
          result = jsonRpc(id, { content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }], structuredContent: parsed });
        } else if (name === 'analyzeListing') {
          const parsed = await parseListing(args);
          result = jsonRpc(id, buildAnalyzeToolResult(calculateDeal(mergeListingWithOverrides(parsed, args)), { parsedListing: parsed }));
        } else if (name === 'compareDeals') {
          result = jsonRpc(id, buildCompareToolResult(compareDeals(args.deals || [])));
        } else if (name === 'saveDeal' || name === 'getDeals') {
          const user = sessionOrBearerUser(req);
          if (name === 'getDeals') {
            try {
              if (!user) {
                result = jsonRpc(id, { content: [{ type: 'text', text: 'Not authenticated — reconnect Deal Analyzer in ChatGPT settings to load saved deals.' }], structuredContent: { deals: [], authenticated: false } });
              } else {
                const deals = getSavedDeals(user.id);
                result = jsonRpc(id, { content: [{ type: 'text', text: `Found ${deals.length} deals` }], structuredContent: { deals, count: deals.length } });
              }
            } catch (err) {
              result = jsonRpc(id, { content: [{ type: 'text', text: `getDeals error: ${errorMessage(err, 'unknown')} | user=${user?.id ?? 'null'} | dbPath=${dbPath}` }], structuredContent: { deals: [], error: errorMessage(err, 'unknown') } });
            }
          } else {
            if (!user && !ALLOW_ANONYMOUS_MODE) {
              result = jsonRpc(id, { content: [{ type: 'text', text: 'Authentication required to save deals. Please reconnect Deal Analyzer in ChatGPT settings.' }], structuredContent: { error: 'unauthenticated' } });
            } else {
              const analysis = calculateDeal(args);
              const savedId = saveDealRecord(args, analysis, user ? user.id : null);
              result = jsonRpc(id, { content: [{ type: 'text', text: 'Deal saved successfully' }], structuredContent: { id: savedId, ...analysis } });
            }
          }
        } else {
          result = jsonRpcError(id, -32601, 'Unknown tool');
        }
        results.push(result); continue;
      }
      results.push(jsonRpcError(id, -32601, 'Unknown method'));
    } catch (error) {
      results.push(jsonRpcError(id, -32000, errorMessage(error, 'Server error')));
    }
  }

  const payload = isBatch ? results.filter(r => r !== null) : (results[0] ?? null);
  mcpSend(res, payload);
}

function mcpSend(res: express.Response, payload: unknown, sessionId?: string) {
  if (sessionId) res.setHeader('Mcp-Session-Id', sessionId);
  const accept = (res.req as Request).headers.accept || '';
  if (accept.includes('text/event-stream')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
    res.end();
  } else {
    res.json(payload);
  }
}

// ── MCP router ────────────────────────────────────────────────────────────────

export const mcpRouter = express.Router();

mcpRouter.get('/mcp', (req, res) => {
  const sessionId = (req.headers['mcp-session-id'] as string) || uuidv4();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Mcp-Session-Id', sessionId);
  res.write(': connected\n\n');
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => clearInterval(keepAlive));
});

mcpRouter.post('/mcp', handleMcpRequest);
mcpRouter.delete('/mcp', (_req, res) => res.sendStatus(200));
