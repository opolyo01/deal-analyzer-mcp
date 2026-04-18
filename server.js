const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '1mb' }));

const APP_NAME = 'deal-analyzer-mcp';
const APP_VERSION = '1.3.0';
const DEFAULT_RATE = Number(process.env.DEFAULT_RATE || 0.065);
const DEFAULT_TERM_YEARS = Number(process.env.DEFAULT_TERM_YEARS || 30);
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
  const downPayment = input.downPayment != null ? Number(input.downPayment) : price * 0.2;

  return {
    price,
    rent: Number(input.rent || 0),
    taxes: Number(input.taxes || 0),
    insurance: Number(input.insurance || 0),
    hoa: Number(input.hoa || 0),
    rate: input.rate != null ? Number(input.rate) : DEFAULT_RATE,
    termYears: input.termYears != null ? Number(input.termYears) : DEFAULT_TERM_YEARS,
    downPaymentAmount: downPayment
  };
}

function calculateDeal(rawInput = {}) {
  const input = normalizeInput(rawInput);
  const loanAmount = Math.max(input.price - input.downPaymentAmount, 0);
  const monthlyMortgage = calculateMortgagePayment(loanAmount, input.rate, input.termYears);
  const monthlyTaxes = annualToMonthly(input.taxes);
  const monthlyInsurance = annualToMonthly(input.insurance);

  const monthlyCost = monthlyMortgage + monthlyTaxes + monthlyInsurance + input.hoa;
  const monthlyCashFlow = input.rent - monthlyCost;
  const capRate = input.price > 0 ? ((input.rent * 12 - input.taxes) / input.price) : 0;

  let score = 5;
  if (monthlyCashFlow > 0) score += 2;
  if (capRate > 0.06) score += 2;
  if (monthlyCashFlow < 0) score -= 2;

  score = clamp(score, 1, 10);

  let recommendation = 'HOLD';
  if (score >= 7) recommendation = 'BUY';
  if (score <= 4) recommendation = 'PASS';

  return {
    summary: {
      monthlyCashFlow: round(monthlyCashFlow),
      capRate: round(capRate, 3),
      score,
      recommendation,
      breakEvenRent: round(monthlyCost)
    }
  };
}

async function parseListing(input = {}) {
  const url = input.url;
  if (!url) return {};

  const response = await axios.get(url);
  const $ = cheerio.load(response.data);
  const text = $('body').text();

  const priceMatch = text.match(/\$[\d,]+/);

  return {
    price: priceMatch ? Number(priceMatch[0].replace(/[$,]/g, '')) : null
  };
}

function buildToolResult(result) {
  return {
    content: [
      {
        type: 'text',
        text: `Score ${result.summary.score}/10 (${result.summary.recommendation})\nCash Flow: ${toCurrency(result.summary.monthlyCashFlow)}`
      }
    ],
    structuredContent: result
  };
}

const tools = [
  {
    name: 'analyzeDeal',
    inputSchema: {
      type: 'object',
      properties: {
        price: { type: 'number' },
        rent: { type: 'number' }
      },
      required: ['price', 'rent']
    }
  }
];

function jsonRpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}

app.post('/mcp', async (req, res) => {
  const { id, method, params } = req.body;

  if (method === 'tools/list') {
    return res.json(jsonRpc(id, { tools }));
  }

  if (method === 'tools/call') {
    const result = calculateDeal(params.arguments);
    return res.json(jsonRpc(id, buildToolResult(result)));
  }

  res.json({ error: 'Unknown method' });
});

app.listen(3000, () => console.log('Running MCP server'));
