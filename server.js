const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));

const APP_NAME = 'deal-analyzer-mcp';
const APP_VERSION = '1.4.0';
const DEFAULT_RATE = Number(process.env.DEFAULT_RATE || 0.065);
const DEFAULT_TERM_YEARS = Number(process.env.DEFAULT_TERM_YEARS || 30);
const DEFAULT_VACANCY_RATE = Number(process.env.DEFAULT_VACANCY_RATE || 0.05);
const DEFAULT_REPAIRS_RATE = Number(process.env.DEFAULT_REPAIRS_RATE || 0.05);
const DEFAULT_CAPEX_RATE = Number(process.env.DEFAULT_CAPEX_RATE || 0.05);
const DEFAULT_MANAGEMENT_RATE = Number(process.env.DEFAULT_MANAGEMENT_RATE || 0.08);
const PORT = Number(process.env.PORT || 3000);
const widgetPath = path.join(__dirname, 'public', 'deal-widget.html');

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

  if (!monthlyRate) {
    return principal / numberOfPayments;
  }

  return principal * (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) /
    (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
}

function parseDownPayment(input, price) {
  if (input.downPaymentAmount != null) {
    return Number(input.downPaymentAmount);
  }

  if (input.downPaymentPercent != null) {
    return price * Number(input.downPaymentPercent);
  }

  if (input.downPayment != null) {
    const value = Number(input.downPayment);
    return value <= 1 ? price * value : value;
  }

  return price * 0.2;
}

function normalizeDealInput(input = {}) {
  const price = Number(input.price || 0);
  const rent = Number(input.rent || 0);
  const downPaymentAmount = parseDownPayment(input, price);

  return {
    label: input.label || input.address || input.sourceUrl || `Deal ${Date.now()}`,
    address: input.address || '',
    sourceUrl: input.sourceUrl || input.url || '',
    price,
    rent,
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

  const monthlyOperatingExpense =
    monthlyTaxes +
    monthlyInsurance +
    input.hoa +
    input.otherMonthlyCosts +
    monthlyVacancy +
    monthlyRepairs +
    monthlyCapex +
    monthlyManagement;

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
      monthlyAllInCost: round(monthlyAllInCost)
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
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function extractMoney(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/\$?\s*([\d,]{4,})(?:\.\d{2})?/);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ''));
}

function walkForNumbers(node, out) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) walkForNumbers(item, out);
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (value == null) continue;
    const lower = key.toLowerCase();

    if (typeof value === 'number') {
      if (out.price == null && (lower.includes('price') || lower === 'amount')) out.price = value;
      if (out.rent == null && lower.includes('rent')) out.rent = value;
      if (out.taxes == null && (lower.includes('tax') || lower.includes('propertytax'))) out.taxes = value;
      if (out.beds == null && (lower.includes('bed') || lower === 'bedrooms')) out.beds = value;
      if (out.baths == null && (lower.includes('bath') || lower === 'bathrooms')) out.baths = value;
      if (out.sqft == null && (lower.includes('sqft') || lower.includes('floorarea') || lower.includes('livingarea'))) out.sqft = value;
    } else if (typeof value === 'string') {
      if (!out.address && /\d+ .+, [A-Za-z .'-]+, [A-Z]{2} \d{5}/.test(value)) {
        out.address = value.match(/\d+ .+, [A-Za-z .'-]+, [A-Z]{2} \d{5}/)[0];
      }
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

  const result = {
    sourceUrl,
    address: '',
    propertyType: '',
    price: null,
    rent: null,
    taxes: null,
    beds: null,
    baths: null,
    sqft: null,
    parserNotes: []
  };

  const addressMatch = bodyText.match(/\d{1,6}\s+[A-Za-z0-9.'\- ]+,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5}/);
  if (addressMatch) result.address = addressMatch[0].trim();

  const propertyTypeMatch = bodyText.match(/\b(single family|single-family|multifamily|multi-family|duplex|triplex|quadruplex|condo|townhome|townhouse|apartment)\b/i);
  if (propertyTypeMatch) result.propertyType = propertyTypeMatch[1];

  const pricePatterns = [
    /(?:list(?:ing)?\s+price|listed\s+for|price)\D{0,20}(\$[\d,]+)/i,
    /(\$[\d,]{5,})/
  ];
  for (const pattern of pricePatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      result.price = extractMoney(match[1]);
      break;
    }
  }

  const rentPatterns = [
    /(?:monthly\s+rent|estimated\s+rent|rent)\D{0,30}(\$[\d,]+)/i,
    /(?:\$[\d,]+\s*\/\s*mo)/i
  ];
  for (const pattern of rentPatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      result.rent = extractMoney(match[1] || match[0]);
      break;
    }
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
  const result = {
    sourceUrl,
    address: '',
    propertyType: '',
    price: null,
    rent: null,
    taxes: null,
    beds: null,
    baths: null,
    sqft: null,
    parserNotes: []
  };

  const metaCandidates = [
    $('meta[property="og:title"]').attr('content'),
    $('title').text(),
    $('meta[name="description"]').attr('content')
  ].filter(Boolean).join(' | ');

  Object.assign(result, parseListingText(metaCandidates, sourceUrl));

  const scripts = $('script').map((_, el) => $(el).html()).get().filter(Boolean);
  for (const scriptContent of scripts) {
    const trimmed = scriptContent.trim();
    let parsed = null;

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      parsed = tryParseJson(trimmed);
    }

    if (!parsed && /"@type"\s*:\s*"Residence"|jsonld/i.test(trimmed)) {
      const jsonStart = trimmed.indexOf('{');
      if (jsonStart >= 0) parsed = tryParseJson(trimmed.slice(jsonStart));
    }

    if (parsed) {
      walkForNumbers(parsed, result);
    }
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
    parserNotes: result.parserNotes.concat([
      sourceUrl.includes('redfin') ? 'Applied Redfin-friendly heuristics' : null,
      sourceUrl.includes('zillow') ? 'Applied Zillow-friendly heuristics' : null
    ].filter(Boolean)),
    extracted: {
      bodyTextPreview: bodyText.slice(0, 500)
    }
  };
}

async function parseListing(input = {}) {
  const url = input.url || input.sourceUrl || '';
  const listingText = input.listingText || '';

  if (listingText) {
    return parseListingText(listingText, url);
  }

  if (!url) {
    throw new Error('Provide url or listingText');
  }

  const response = await axios.get(url, {
    timeout: 12000,
    headers: {
      'User-Agent': 'deal-analyzer-mcp/1.4.0 (+https://github.com/opolyo01/deal-analyzer-mcp)'
    }
  });

  return extractStructuredDataFromHtml(response.data, url);
}

function compareDeals(rawDeals = []) {
  const analyses = rawDeals.map((deal, index) => {
    const analysis = calculateDeal(deal);
    return {
      rank: index + 1,
      label: analysis.input.label || `Deal ${index + 1}`,
      analysis
    };
  });

  analyses.sort((a, b) => {
    if (b.analysis.summary.score !== a.analysis.summary.score) {
      return b.analysis.summary.score - a.analysis.summary.score;
    }
    return b.analysis.summary.monthlyCashFlow - a.analysis.summary.monthlyCashFlow;
  });

  analyses.forEach((item, index) => {
    item.rank = index + 1;
  });

  const best = analyses[0] || null;

  return {
    bestDealLabel: best ? best.label : null,
    analyses
  };
}

function buildAnalyzeToolResult(result, extra = {}) {
  return {
    content: [
      {
        type: 'text',
        text: [
          `Deal score: ${result.summary.score}/10 (${result.summary.recommendation})`,
          `Cash flow: ${asCurrency(result.summary.monthlyCashFlow)}/mo`,
          `Cap rate: ${(result.summary.capRate * 100).toFixed(1)}%`,
          `Break-even rent: ${asCurrency(result.summary.breakEvenRent)}/mo`
        ].join('\n')
      }
    ],
    structuredContent: {
      ...result,
      ...extra
    },
    _meta: {
      'openai/outputTemplate': 'ui://widget/deal-widget.html'
    }
  };
}

function buildCompareToolResult(comparison) {
  const lines = comparison.analyses.map((item) =>
    `${item.rank}. ${item.label} — score ${item.analysis.summary.score}/10, cash flow ${asCurrency(item.analysis.summary.monthlyCashFlow)}/mo`
  );

  return {
    content: [
      {
        type: 'text',
        text: [
          comparison.bestDealLabel ? `Best deal: ${comparison.bestDealLabel}` : 'No deals provided.',
          ...lines
        ].join('\n')
      }
    ],
    structuredContent: comparison
  };
}

const tools = [
  {
    name: 'analyzeDeal',
    title: 'Analyze real estate deal',
    description: 'Underwrite a rental property using deterministic math and return deal score, cash flow, cap rate, and recommendation.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        label: { type: 'string' },
        address: { type: 'string' },
        price: { type: 'number' },
        rent: { type: 'number' },
        taxes: { type: 'number' },
        insurance: { type: 'number' },
        hoa: { type: 'number' },
        otherMonthlyCosts: { type: 'number' },
        rate: { type: 'number' },
        termYears: { type: 'number' },
        downPayment: { type: 'number' },
        downPaymentAmount: { type: 'number' },
        downPaymentPercent: { type: 'number' },
        vacancyRate: { type: 'number' },
        repairsRate: { type: 'number' },
        capexRate: { type: 'number' },
        managementRate: { type: 'number' },
        propertyType: { type: 'string' },
        beds: { type: 'number' },
        baths: { type: 'number' },
        sqft: { type: 'number' }
      },
      required: ['price', 'rent']
    },
    annotations: {
      readOnlyHint: true
    }
  },
  {
    name: 'parseListing',
    title: 'Parse listing',
    description: 'Extract basic fields from Redfin, Zillow, or pasted listing text.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        url: { type: 'string' },
        sourceUrl: { type: 'string' },
        listingText: { type: 'string' }
      }
    },
    annotations: {
      readOnlyHint: true
    }
  },
  {
    name: 'analyzeListing',
    title: 'Parse and analyze listing',
    description: 'Extract what is available from a listing and merge in manual assumptions before underwriting.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        url: { type: 'string' },
        listingText: { type: 'string' },
        price: { type: 'number' },
        rent: { type: 'number' },
        taxes: { type: 'number' },
        insurance: { type: 'number' },
        hoa: { type: 'number' },
        rate: { type: 'number' },
        termYears: { type: 'number' },
        downPayment: { type: 'number' },
        downPaymentAmount: { type: 'number' },
        downPaymentPercent: { type: 'number' }
      }
    },
    annotations: {
      readOnlyHint: true
    }
  },
  {
    name: 'compareDeals',
    title: 'Compare multiple deals',
    description: 'Analyze and rank multiple real estate deals side by side.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        deals: {
          type: 'array',
          minItems: 2,
          items: {
            type: 'object',
            additionalProperties: true
          }
        }
      },
      required: ['deals']
    },
    annotations: {
      readOnlyHint: true
    }
  }
];

function jsonRpc(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

app.get('/', (req, res) => {
  res.json({
    name: APP_NAME,
    version: APP_VERSION,
    endpoints: {
      mcp: '/mcp',
      health: '/health',
      analyze: '/analyze',
      parseListing: '/parse-listing',
      compare: '/compare',
      widget: '/public/deal-widget.html'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, app: APP_NAME, version: APP_VERSION });
});

app.get('/.well-known/app.json', (req, res) => {
  res.json({
    name: 'Deal Analyzer MCP',
    description: 'ChatGPT app for underwriting and comparing real estate deals.',
    mcp_url: `${req.protocol}://${req.get('host')}/mcp`,
    developer: { name: 'opolyo01' }
  });
});

app.get('/public/deal-widget.html', (req, res) => {
  res.sendFile(widgetPath);
});

app.post('/analyze', (req, res) => {
  try {
    const result = calculateDeal(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to analyze deal.' });
  }
});

app.post('/parse-listing', async (req, res) => {
  try {
    const parsed = await parseListing(req.body || {});
    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to parse listing.' });
  }
});

app.post('/compare', (req, res) => {
  try {
    const comparison = compareDeals(req.body?.deals || []);
    res.json(comparison);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to compare deals.' });
  }
});

app.post('/mcp', async (req, res) => {
  const { id, method, params } = req.body || {};

  try {
    if (method === 'initialize') {
      return res.json(jsonRpc(id, {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: {},
          resources: {}
        },
        serverInfo: {
          name: APP_NAME,
          version: APP_VERSION
        }
      }));
    }

    if (method === 'tools/list') {
      return res.json(jsonRpc(id, { tools }));
    }

    if (method === 'resources/list') {
      return res.json(jsonRpc(id, {
        resources: [
          {
            uri: 'ui://widget/deal-widget.html',
            name: 'Deal analysis widget',
            mimeType: 'text/html',
            description: 'Simple scorecard widget for deal analysis results.'
          }
        ]
      }));
    }

    if (method === 'resources/read') {
      if (params?.uri !== 'ui://widget/deal-widget.html') {
        return res.json(jsonRpcError(id, -32002, 'Unknown resource URI.'));
      }

      return res.json(jsonRpc(id, {
        contents: [
          {
            uri: 'ui://widget/deal-widget.html',
            mimeType: 'text/html',
            text: fs.readFileSync(widgetPath, 'utf8')
          }
        ]
      }));
    }

    if (method === 'tools/call') {
      const name = params?.name;
      const args = params?.arguments || {};

      if (name === 'analyzeDeal') {
        const result = calculateDeal(args);
        return res.json(jsonRpc(id, buildAnalyzeToolResult(result)));
      }

      if (name === 'parseListing') {
        const parsed = await parseListing(args);
        return res.json(jsonRpc(id, {
          content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }],
          structuredContent: parsed
        }));
      }

      if (name === 'analyzeListing') {
        const parsed = await parseListing(args);
        const merged = { ...args, ...parsed, sourceUrl: args.url || parsed.sourceUrl };
        const result = calculateDeal(merged);
        return res.json(jsonRpc(id, buildAnalyzeToolResult(result, { parsedListing: parsed })));
      }

      if (name === 'compareDeals') {
        const comparison = compareDeals(args.deals || []);
        return res.json(jsonRpc(id, buildCompareToolResult(comparison)));
      }

      return res.json(jsonRpcError(id, -32601, `Unknown tool: ${name}`));
    }

    return res.json(jsonRpcError(id, -32601, `Unknown method: ${method}`));
  } catch (error) {
    return res.json(jsonRpcError(id, -32000, error.message || 'Server error'));
  }
});

app.listen(PORT, () => {
  console.log(`${APP_NAME} listening on port ${PORT}`);
});
