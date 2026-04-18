const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

const app = express();
app.use(express.json({ limit: '1mb' }));

const APP_NAME = 'deal-analyzer-mcp';
const APP_VERSION = '1.2.1';
const DEFAULT_RATE = Number(process.env.DEFAULT_RATE || 0.065);
const DEFAULT_TERM_YEARS = Number(process.env.DEFAULT_TERM_YEARS || 30);
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const widgetPath = path.join(__dirname, 'public', 'deal-widget.html');

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function annualToMonthly(value) {
  return Number(value || 0) / 12;
}

function toCurrency(value) {
  const sign = value < 0 ? '-' : '';
  const amount = Math.abs(Math.round(value || 0));
  return `${sign}$${amount.toLocaleString('en-US')}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calculateMortgagePayment(principal, annualRate, termYears) {
  if (!principal || principal <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const numberOfPayments = termYears * 12;

  if (!monthlyRate) return principal / numberOfPayments;

  return principal * (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) /
    (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
}

function normalizeInput(input = {}) {
  const price = Number(input.price || 0);
  const directDownPayment = input.downPaymentAmount != null ? Number(input.downPaymentAmount) : null;
  const percentDownPayment = input.downPaymentPercent != null
    ? Number(input.downPaymentPercent)
    : input.downPayment != null && Number(input.downPayment) <= 1
      ? Number(input.downPayment)
      : null;
  const amountDownPayment = directDownPayment != null
    ? directDownPayment
    : input.downPayment != null && Number(input.downPayment) > 1
      ? Number(input.downPayment)
      : percentDownPayment != null
        ? price * percentDownPayment
        : price * 0.2;

  return {
    address: input.address || '',
    sourceUrl: input.sourceUrl || input.url || '',
    price,
    rent: Number(input.rent || 0),
    taxes: Number(input.taxes || 0),
    insurance: Number(input.insurance || 0),
    hoa: Number(input.hoa || 0),
    rate: input.rate != null ? Number(input.rate) : DEFAULT_RATE,
    termYears: input.termYears != null ? Number(input.termYears) : DEFAULT_TERM_YEARS,
    downPaymentAmount: amountDownPayment,
    downPaymentPercent: price > 0 ? amountDownPayment / price : 0,
    vacancyRate: input.vacancyRate != null ? Number(input.vacancyRate) : 0.05,
    repairsRate: input.repairsRate != null ? Number(input.repairsRate) : 0.05,
    capexRate: input.capexRate != null ? Number(input.capexRate) : 0.05,
    managementRate: input.managementRate != null ? Number(input.managementRate) : 0.08,
    notes: input.notes || ''
  };
}

function calculateDeal(rawInput = {}) {
  const input = normalizeInput(rawInput);
  const loanAmount = Math.max(input.price - input.downPaymentAmount, 0);
  const monthlyMortgage = calculateMortgagePayment(loanAmount, input.rate, input.termYears);
  const monthlyTaxes = annualToMonthly(input.taxes);
  const monthlyInsurance = annualToMonthly(input.insurance);
  const monthlyVacancy = input.rent * input.vacancyRate;
  const monthlyRepairs = input.rent * input.repairsRate;
  const monthlyCapex = input.rent * input.capexRate;
  const monthlyManagement = input.rent * input.managementRate;

  const monthlyOperatingExpense = monthlyTaxes + monthlyInsurance + input.hoa + monthlyVacancy + monthlyRepairs + monthlyCapex + monthlyManagement;
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
  if (monthlyCashFlow > 250) score += 2;
  else if (monthlyCashFlow > 0) score += 1;
  else if (monthlyCashFlow < -500) score -= 2;
  else if (monthlyCashFlow < 0) score -= 1;

  if (capRate >= 0.07) score += 2;
  else if (capRate >= 0.055) score += 1;
  else if (capRate < 0.045) score -= 1;

  if (dscr >= 1.25) score += 1;
  else if (dscr > 0 && dscr < 1.0) score -= 1;

  score = clamp(score, 1, 10);

  let recommendation = 'HOLD';
  if (score >= 8) recommendation = 'BUY';
  if (score <= 4) recommendation = 'PASS';

  const risks = [];
  const strengths = [];

  if (monthlyCashFlow < 0) risks.push('Negative monthly cash flow at current assumptions');
  if (capRate < 0.05) risks.push('Cap rate is weak for a leveraged rental');
  if (input.taxes === 0) risks.push('Property taxes missing, so underwriting may be optimistic');
  if (input.insurance === 0) risks.push('Insurance missing, so monthly costs may be understated');
  if (input.rent === 0) risks.push('Rent is missing, so the analysis is incomplete');
  if (dscr > 0 && dscr < 1.1) risks.push('Debt coverage is thin');

  if (monthlyCashFlow > 0) strengths.push('Positive projected monthly cash flow');
  if (capRate >= 0.06) strengths.push('Cap rate clears a basic rental threshold');
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

async function explainDeal(result) {
  if (!openai) {
    return [
      `Score: ${result.summary.score}/10 (${result.summary.recommendation}).`,
      `Cash flow: ${toCurrency(result.summary.monthlyCashFlow)} per month.`,
      result.risks.length ? `Top risk: ${result.risks[0]}.` : 'No obvious red flags from the provided numbers.'
    ].join(' ');
  }

  const prompt = [
    'You are a conservative real estate deal analyst.',
    'Write three short sections: verdict, risks, negotiation angle.',
    'Keep it concise and tie each point to the numbers.',
    JSON.stringify({ summary: result.summary, assumptions: result.assumptions, risks: result.risks, strengths: result.strengths })
  ].join('\n');

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.choices?.[0]?.message?.content || 'No explanation generated.';
}

async function parseListing(input = {}) {
  const url = input.url || input.sourceUrl;
  let bodyText = (input.listingText || '').trim();

  if (!bodyText && url) {
    const response = await axios.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent': 'deal-analyzer-mcp/1.2.1 (+https://github.com/opolyo01/deal-analyzer-mcp)'
      }
    });
    const $ = cheerio.load(response.data);
    bodyText = $('body').text().replace(/\s+/g, ' ');
  }

  if (!bodyText) {
    throw new Error('Provide url or listingText');
  }

  const extractMoney = (regex) => {
    const match = bodyText.match(regex);
    if (!match) return null;
    return Number(match[1].replace(/[$,]/g, ''));
  };

  const price = extractMoney(/(?:list(?:ing)?\s+price|price|listed\s+for)\D{0,20}(\$[\d,]+)/i) || extractMoney(/(\$[\d,]{4,})/i);
  const rent = extractMoney(/(?:rent|estimated\s+rent|monthly\s+rent)\D{0,25}(\$[\d,]+)/i);
  const taxes = extractMoney(/(?:property\s+tax(?:es)?|tax(?:es)?)\D{0,25}(\$[\d,]+)/i);

  const bedsMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*bed/i);
  const bathsMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*bath/i);
  const sqftMatch = bodyText.match(/([\d,]+)\s*(?:sq\.?\s*ft|square\s*feet)/i);
  const addressMatch = bodyText.match(/\d+\s+[A-Za-z0-9.\-\s]+,\s*[A-Za-z.\-\s]+,\s*[A-Z]{2}\s*\d{5}/);

  return {
    address: addressMatch ? addressMatch[0].trim() : '',
    sourceUrl: url || '',
    price,
    rent,
    taxes,
    beds: bedsMatch ? Number(bedsMatch[1]) : null,
    baths: bathsMatch ? Number(bathsMatch[1]) : null,
    sqft: sqftMatch ? Number(sqftMatch[1].replace(/,/g, '')) : null,
    extracted: {
      bodyTextPreview: bodyText.slice(0, 500)
    }
  };
}

function buildToolResult(result, explanation, extra = {}) {
  return {
    content: [
      {
        type: 'text',
        text: [
          `Deal score: ${result.summary.score}/10 (${result.summary.recommendation})`,
          `Cash flow: ${toCurrency(result.summary.monthlyCashFlow)}/mo`,
          `Cap rate: ${(result.summary.capRate * 100).toFixed(1)}%`,
          `Break-even rent: ${toCurrency(result.summary.breakEvenRent)}/mo`,
          explanation || ''
        ].filter(Boolean).join('\n')
      }
    ],
    structuredContent: {
      summary: result.summary,
      assumptions: result.assumptions,
      strengths: result.strengths,
      risks: result.risks,
      widget: {
        template: 'ui://widget/deal-widget.html'
      },
      ...extra
    },
    _meta: {
      'openai/outputTemplate': 'ui://widget/deal-widget.html'
    }
  };
}

const tools = [
  {
    name: 'analyzeDeal',
    title: 'Analyze real estate deal',
    description: 'Underwrite a rental property using deterministic math and return deal score, cash flow, cap rate, risks, and recommendation.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        address: { type: 'string', description: 'Property address if known.' },
        price: { type: 'number', description: 'Purchase price.' },
        rent: { type: 'number', description: 'Expected monthly rent.' },
        taxes: { type: 'number', description: 'Annual property taxes.' },
        insurance: { type: 'number', description: 'Annual insurance.' },
        hoa: { type: 'number', description: 'Monthly HOA dues.' },
        rate: { type: 'number', description: 'Mortgage rate as decimal, for example 0.065.' },
        termYears: { type: 'number', description: 'Mortgage term in years.' },
        downPaymentPercent: { type: 'number', description: 'Down payment as decimal, for example 0.25.' },
        downPaymentAmount: { type: 'number', description: 'Down payment in dollars.' },
        vacancyRate: { type: 'number', description: 'Vacancy reserve as decimal.' },
        repairsRate: { type: 'number', description: 'Repairs reserve as decimal.' },
        capexRate: { type: 'number', description: 'Capital expenditure reserve as decimal.' },
        managementRate: { type: 'number', description: 'Management cost as decimal.' },
        notes: { type: 'string', description: 'Optional notes for explanation.' }
      },
      required: ['price', 'rent']
    },
    annotations: {
      readOnlyHint: true
    }
  },
  {
    name: 'parseListing',
    title: 'Parse real estate listing',
    description: 'Extract basic property fields from a listing URL or pasted listing text.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        url: { type: 'string', description: 'Public listing URL.' },
        listingText: { type: 'string', description: 'Raw pasted listing text.' }
      }
    },
    annotations: {
      readOnlyHint: true
    }
  },
  {
    name: 'analyzeListing',
    title: 'Parse and analyze listing',
    description: 'Extract what is available from a listing URL or pasted text, merge in any manual assumptions, and run underwriting.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        url: { type: 'string' },
        listingText: { type: 'string' },
        rent: { type: 'number', description: 'Monthly rent override if not present in listing.' },
        taxes: { type: 'number', description: 'Annual tax override.' },
        insurance: { type: 'number', description: 'Annual insurance override.' },
        hoa: { type: 'number', description: 'Monthly HOA override.' },
        rate: { type: 'number' },
        termYears: { type: 'number' },
        downPaymentPercent: { type: 'number' },
        downPaymentAmount: { type: 'number' }
      }
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
    description: 'ChatGPT app for underwriting real estate deals and parsing public listings.',
    mcp_url: `${req.protocol}://${req.get('host')}/mcp`,
    developer: { name: 'opolyo01' }
  });
});

app.get('/public/deal-widget.html', (req, res) => {
  res.sendFile(widgetPath);
});

app.post('/analyze', async (req, res) => {
  try {
    const result = calculateDeal(req.body || {});
    const explanation = await explainDeal(result);
    res.json({ ...result, explanation });
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

      if (name === 'parseListing') {
        const parsed = await parseListing(args);
        return res.json(jsonRpc(id, {
          content: [{ type: 'text', text: JSON.stringify(parsed, null, 2) }],
          structuredContent: parsed
        }));
      }

      if (name === 'analyzeDeal') {
        const result = calculateDeal(args);
        const explanation = await explainDeal(result);
        return res.json(jsonRpc(id, buildToolResult(result, explanation)));
      }

      if (name === 'analyzeListing') {
        const parsed = await parseListing(args);
        const mergedInput = { ...args, ...parsed, sourceUrl: args.url || parsed.sourceUrl };
        const result = calculateDeal(mergedInput);
        const explanation = await explainDeal(result);
        return res.json(jsonRpc(id, buildToolResult(result, explanation, { parsedListing: parsed })));
      }

      return res.json(jsonRpcError(id, -32601, `Unknown tool: ${name}`));
    }

    return res.json(jsonRpcError(id, -32601, `Unknown method: ${method}`));
  } catch (error) {
    return res.json(jsonRpcError(id, -32000, error.message || 'Server error'));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Deal Analyzer MCP listening on port ${PORT}`);
});
