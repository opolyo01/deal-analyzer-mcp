// PATCHED VERSION WITH SQLITE MCP TOOLS
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { saveDeal, getDeals } = require('./db');

const app = express();
app.use(express.json({ limit: '1mb' }));

// --- keep your existing logic ABOVE ---

// ===== MCP EXTENSIONS =====

// ADD tools
const extraTools = [
  {
    name: 'saveDeal',
    description: 'Save deal to database',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string' },
        price: { type: 'number' },
        rent: { type: 'number' }
      },
      required: ['price']
    }
  },
  {
    name: 'getDeals',
    description: 'Get saved deals',
    inputSchema: { type: 'object', properties: {} }
  }
];

// merge tools dynamically if exists
if (typeof tools !== 'undefined') {
  tools.push(...extraTools);
}

// patch MCP handler
const originalHandler = app._router.stack.find(r => r.route && r.route.path === '/mcp');

app.post('/mcp', async (req, res, next) => {
  const { id, method, params } = req.body || {};

  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments || {};

    if (name === 'saveDeal') {
      const result = calculateDeal(args);
      const savedId = saveDeal(args, result);

      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: 'Deal saved successfully' }],
          structuredContent: { id: savedId, ...result }
        }
      });
    }

    if (name === 'getDeals') {
      const deals = getDeals();

      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Found ${deals.length} deals` }],
          structuredContent: deals
        }
      });
    }
  }

  next();
});
