const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

function calculateDeal(input) {
  const price = input.price || 0;
  const rent = input.rent || 0;
  const taxes = input.taxes || 0;
  const insurance = input.insurance || 0;
  const hoa = input.hoa || 0;
  const downPayment = input.downPayment || 0.2;
  const rate = input.rate || 0.065;

  const loan = price * (1 - downPayment);
  const mRate = rate / 12;
  const n = 360;

  const mortgage = loan * (mRate * Math.pow(1 + mRate, n)) /
    (Math.pow(1 + mRate, n) - 1);

  const monthlyTaxes = taxes / 12;
  const monthlyInsurance = insurance / 12;

  const totalCost = mortgage + monthlyTaxes + monthlyInsurance + hoa;
  const cashFlow = rent - totalCost;

  const capRate = ((rent * 12 - taxes) / price);
  const breakEvenRent = totalCost;

  let score = 5;
  if (cashFlow > 0) score += 2;
  if (capRate > 0.06) score += 2;
  if (cashFlow < 0) score -= 2;

  let recommendation = 'HOLD';
  if (score >= 7) recommendation = 'BUY';
  if (score <= 4) recommendation = 'PASS';

  return {
    summary: {
      cashFlow: Math.round(cashFlow),
      capRate: Number(capRate.toFixed(3)),
      score,
      recommendation,
      breakEvenRent: Math.round(breakEvenRent)
    }
  };
}

async function explainDeal(data) {
  if (!client) {
    return `Deal score ${data.summary.score}. Cash flow ${data.summary.cashFlow}. Likely ${data.summary.recommendation}.`;
  }

  const prompt = `Analyze this deal: ${JSON.stringify(data.summary)}. Give risks and negotiation tips.`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }]
  });

  return res.choices[0].message.content;
}

async function parseListing(url) {
  try {
    const html = await axios.get(url);
    const $ = cheerio.load(html.data);

    const text = $('body').text();
    const priceMatch = text.match(/\$[\d,]+/);

    return {
      price: priceMatch ? Number(priceMatch[0].replace(/[$,]/g, '')) : null
    };
  } catch (e) {
    return { error: 'Failed to parse listing' };
  }
}

app.post('/analyze', async (req, res) => {
  let input = req.body;

  if (input.url) {
    const parsed = await parseListing(input.url);
    input = { ...input, ...parsed };
  }

  const result = calculateDeal(input);
  const explanation = await explainDeal(result);

  res.json({ ...result, explanation });
});

// MCP-like endpoint
app.post('/mcp', async (req, res) => {
  const { method, params } = req.body;

  if (method === 'tools/list') {
    return res.json({
      tools: [
        { name: 'analyzeDeal' },
        { name: 'parseListing' }
      ]
    });
  }

  if (method === 'tools/call') {
    if (params.name === 'analyzeDeal') {
      const result = calculateDeal(params.arguments);
      return res.json({ result });
    }
  }

  res.json({ error: 'Unknown method' });
});

app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
