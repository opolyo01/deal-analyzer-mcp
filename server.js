const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

function analyzeDeal(input) {
  const price = input.price || 0;
  const rent = input.rent || 0;
  const taxes = input.taxes || 0;
  const downPayment = input.downPayment || 0.2;

  const loanAmount = price * (1 - downPayment);
  const monthlyRate = 0.065 / 12;
  const numPayments = 30 * 12;

  const mortgage = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1);

  const monthlyTaxes = taxes / 12;
  const totalMonthlyCost = mortgage + monthlyTaxes;

  const cashFlow = rent - totalMonthlyCost;
  const annualRent = rent * 12;
  const capRate = (annualRent - taxes) / price;

  let score = 5;
  if (cashFlow > 0) score += 2;
  if (capRate > 0.06) score += 2;
  if (cashFlow < 0) score -= 2;

  let recommendation = 'HOLD';
  if (score >= 7) recommendation = 'BUY';
  if (score <= 4) recommendation = 'PASS';

  return {
    cashFlow: Math.round(cashFlow),
    capRate: Number(capRate.toFixed(3)),
    score,
    recommendation
  };
}

app.post('/analyze', (req, res) => {
  const result = analyzeDeal(req.body);
  res.json(result);
});

app.get('/', (req, res) => {
  res.send('Deal Analyzer MCP running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});