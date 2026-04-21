import axios from 'axios';
import * as cheerio from 'cheerio';
import type { JsonRecord } from './types';

// ── Default assumptions ───────────────────────────────────────────────────────

export const DEFAULT_RATE = Number(process.env.DEFAULT_RATE || 0.065);
export const DEFAULT_TERM_YEARS = Number(process.env.DEFAULT_TERM_YEARS || 30);
export const DEFAULT_VACANCY_RATE = Number(process.env.DEFAULT_VACANCY_RATE || 0.05);
export const DEFAULT_REPAIRS_RATE = Number(process.env.DEFAULT_REPAIRS_RATE || 0.05);
export const DEFAULT_CAPEX_RATE = Number(process.env.DEFAULT_CAPEX_RATE || 0.05);
export const DEFAULT_MANAGEMENT_RATE = Number(process.env.DEFAULT_MANAGEMENT_RATE || 0.08);
export const DEFAULT_PROPERTY_TAX_RATE = Number(process.env.DEFAULT_PROPERTY_TAX_RATE || 0.011);
export const DEFAULT_INSURANCE_RATE = Number(process.env.DEFAULT_INSURANCE_RATE || 0.0035);

export const STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
]);

export const PROPERTY_TAX_RATE_BY_STATE: JsonRecord = {
  AL: 0.004, AK: 0.010, AZ: 0.006, AR: 0.006, CA: 0.0075, CO: 0.005, CT: 0.019, DE: 0.006, FL: 0.009, GA: 0.009,
  HI: 0.003, ID: 0.007, IL: 0.020, IN: 0.0085, IA: 0.015, KS: 0.013, KY: 0.008, LA: 0.006, ME: 0.013, MD: 0.010,
  MA: 0.011, MI: 0.015, MN: 0.011, MS: 0.007, MO: 0.010, MT: 0.008, NE: 0.016, NV: 0.006, NH: 0.018, NJ: 0.023,
  NM: 0.007, NY: 0.016, NC: 0.008, ND: 0.009, OH: 0.015, OK: 0.009, OR: 0.009, PA: 0.014, RI: 0.015, SC: 0.006,
  SD: 0.012, TN: 0.006, TX: 0.016, UT: 0.006, VT: 0.018, VA: 0.008, WA: 0.009, WV: 0.006, WI: 0.017, WY: 0.006, DC: 0.006
};

export const INSURANCE_STATE_MULTIPLIER: JsonRecord = {
  AL: 1.25, AK: 1.1, AZ: 0.95, AR: 1.25, CA: 1.25, CO: 1.35, CT: 1.05, DE: 1.0, FL: 2.25, GA: 1.15,
  HI: 1.15, ID: 0.9, IL: 1.0, IN: 1.0, IA: 1.1, KS: 1.25, KY: 1.05, LA: 1.9, ME: 0.95, MD: 1.0,
  MA: 1.05, MI: 1.05, MN: 1.15, MS: 1.35, MO: 1.15, MT: 1.05, NE: 1.25, NV: 0.95, NH: 0.95, NJ: 1.05,
  NM: 1.0, NY: 1.1, NC: 1.15, ND: 1.1, OH: 0.95, OK: 1.55, OR: 0.9, PA: 0.95, RI: 1.1, SC: 1.25,
  SD: 1.1, TN: 1.05, TX: 1.65, UT: 0.9, VT: 0.95, VA: 0.95, WA: 0.95, WV: 0.95, WI: 0.95, WY: 1.0, DC: 1.0
};

export const RENT_STATE_MULTIPLIER: JsonRecord = {
  CA: 1.12, NY: 1.1, MA: 1.08, NJ: 1.06, WA: 1.05, DC: 1.12, CO: 1.04, FL: 1.03, TX: 1.02,
  IL: 1.0, PA: 0.96, OH: 0.92, MI: 0.92, IN: 0.9, WI: 0.92, MO: 0.9, AL: 0.88, MS: 0.86, WV: 0.84
};

// ── Math helpers ──────────────────────────────────────────────────────────────

export function round(value: number, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}
export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
export function annualToMonthly(value: number) {
  return Number(value || 0) / 12;
}
export function asCurrency(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(value || 0)).toLocaleString('en-US')}`;
}
export function roundToNearest(value: number, step = 25) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}
export function calculateMortgagePayment(principal: number, annualRate: number, termYears: number) {
  if (!principal || principal <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const n = termYears * 12;
  if (!monthlyRate) return principal / n;
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
}
export function hasInputValue(value: unknown) {
  return value != null && value !== '';
}
export function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * p));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (index - lower));
}

// ── Location helpers ──────────────────────────────────────────────────────────

export function normalizeStateCode(value: unknown) {
  if (typeof value !== 'string') return '';
  const code = value.trim().toUpperCase();
  return STATE_CODES.has(code) ? code : '';
}

export function inferLocation(input: JsonRecord = {}) {
  const explicitState = normalizeStateCode(input.state);
  const address = String(input.address || input.label || '').trim();
  const sourceUrl = String(input.sourceUrl || input.url || '').trim();
  let city = typeof input.city === 'string' ? input.city.trim() : '';
  let state = explicitState;
  let confidence = state ? 'medium' : 'low';

  const addressMatch = address.match(/,\s*([^,]+),\s*([A-Z]{2})(?:\s+\d{5})?\b/);
  if (!state && addressMatch) { state = normalizeStateCode(addressMatch[2]); city = city || addressMatch[1].trim(); confidence = state ? 'medium' : confidence; }
  const redfinMatch = sourceUrl.match(/\/([A-Z]{2})\/([^/?#]+)/);
  if (!state && redfinMatch) { state = normalizeStateCode(redfinMatch[1]); city = city || decodeURIComponent(redfinMatch[2]).replace(/-/g, ' '); confidence = state ? 'medium' : confidence; }
  const zillowMatch = sourceUrl.match(/-([A-Za-z-]+)-([A-Z]{2})-\d{5}/);
  if (!state && zillowMatch) { state = normalizeStateCode(zillowMatch[2]); city = city || zillowMatch[1].replace(/-/g, ' '); confidence = state ? 'medium' : confidence; }
  return { city, state, confidence };
}

export function propertyKind(propertyType = '') {
  const kind = String(propertyType || '').toLowerCase();
  if (kind.includes('condo') || kind.includes('condominium')) return 'condo';
  if (kind.includes('townhouse') || kind.includes('townhome')) return 'townhouse';
  if (kind.includes('duplex') || kind.includes('triplex') || kind.includes('quad') || kind.includes('multi')) return 'multifamily';
  return 'singleFamily';
}

export function propertyTypeUsuallyHasHoa(propertyType = '') {
  const kind = String(propertyType || '').toLowerCase();
  return kind.includes('condo') || kind.includes('townhome') || kind.includes('townhouse');
}

// ── Estimation ────────────────────────────────────────────────────────────────

export function parseDownPayment(input: JsonRecord, price: number) {
  if (input.downPaymentAmount != null) return Number(input.downPaymentAmount);
  if (input.downPaymentPercent != null) return price * Number(input.downPaymentPercent);
  if (input.downPayment != null) { const v = Number(input.downPayment); return v <= 1 ? price * v : v; }
  return price * 0.2;
}

export function estimateRent(price: number, propertyType = '', location: JsonRecord = {}) {
  if (!price) return { rent: 0, low: 0, high: 0, estimated: true, confidence: 'low', method: 'price-rent heuristic', compsUsed: 0 };
  const kind = String(propertyType || '').toLowerCase();
  let ratio = 0.006;
  if (price < 300000) ratio = 0.008;
  if (price > 800000) ratio = 0.005;
  if (kind.includes('multi') || kind.includes('duplex') || kind.includes('triplex') || kind.includes('quad')) ratio += 0.001;
  if (kind.includes('condo')) ratio -= 0.0005;
  const stateMultiplier = location.state ? (RENT_STATE_MULTIPLIER[location.state] ?? 1) : 1;
  const rent = roundToNearest(price * ratio * stateMultiplier, 25);
  return {
    rent,
    low: roundToNearest(rent * 0.88, 25),
    high: roundToNearest(rent * 1.12, 25),
    estimated: true,
    confidence: price >= 250000 && price <= 900000 ? (location.state ? 'medium' : 'low') : 'low',
    method: 'price-rent heuristic',
    compsUsed: 0,
    location
  };
}

export function normalizeRentComps(input: JsonRecord = {}) {
  const raw = Array.isArray(input.rentComps) ? input.rentComps : [];
  return raw.flatMap((comp: JsonRecord) => {
    const rent = Number(comp?.rent || comp?.monthlyRent || 0);
    if (!Number.isFinite(rent) || rent <= 0) return [];
    return [{ rent, beds: comp.beds != null ? Number(comp.beds) : null, baths: comp.baths != null ? Number(comp.baths) : null, sqft: comp.sqft != null ? Number(comp.sqft) : null, distanceMiles: comp.distanceMiles != null ? Number(comp.distanceMiles) : null, source: comp.source || '', address: comp.address || '' }];
  });
}

export function estimateMarketRent(input: JsonRecord = {}, location: JsonRecord = {}) {
  const priceEstimate = estimateRent(Number(input.price || 0), input.propertyType, location);
  const comps = normalizeRentComps(input);
  if (comps.length) {
    const rents = comps.map(c => c.rent);
    const rent = roundToNearest(percentile(rents, 0.5), 25);
    return {
      rent,
      low: roundToNearest(percentile(rents, 0.25), 25),
      high: roundToNearest(percentile(rents, 0.75), 25),
      estimated: true,
      confidence: comps.length >= 3 ? 'medium' : 'low',
      method: 'provided rent comps',
      compsUsed: comps.length,
      comps: comps.slice(0, 8),
      priceEstimate,
      location
    };
  }
  return priceEstimate;
}

export function estimatePropertyTaxes(price: number, location: JsonRecord = {}) {
  if (!price || price <= 0) return null;
  const state = normalizeStateCode(location.state);
  const rate = state ? (PROPERTY_TAX_RATE_BY_STATE[state] ?? DEFAULT_PROPERTY_TAX_RATE) : DEFAULT_PROPERTY_TAX_RATE;
  const annual = roundToNearest(price * rate, 50);
  return { annual, monthly: round(annual / 12), rate, state: state || null, confidence: state ? 'medium' : 'low', method: state ? 'state effective-rate heuristic' : 'default national heuristic' };
}

export function estimateInsurance(price: number, propertyType = '', location: JsonRecord = {}) {
  if (!price || price <= 0) return null;
  const kind = propertyKind(propertyType);
  const profile: JsonRecord = {
    condo: { rate: 0.0018, minimum: 650 },
    townhouse: { rate: 0.0025, minimum: 900 },
    multifamily: { rate: 0.0045, minimum: 1600 },
    singleFamily: { rate: DEFAULT_INSURANCE_RATE, minimum: 1100 }
  }[kind];
  const state = normalizeStateCode(location.state);
  const multiplier = state ? (INSURANCE_STATE_MULTIPLIER[state] ?? 1) : 1;
  const annual = roundToNearest(Math.max(profile.minimum, price * profile.rate * multiplier), 25);
  return { annual, monthly: round(annual / 12), rate: profile.rate, stateMultiplier: multiplier, propertyType: kind, state: state || null, confidence: state && propertyType ? 'medium' : 'low', method: 'property-type insurance heuristic' };
}

// ── Deal calculation ──────────────────────────────────────────────────────────

export function normalizeDealInput(input: JsonRecord = {}) {
  const price = Number(input.price || 0);
  const propertyType = input.propertyType || '';
  const location = inferLocation(input);
  const rentProvided = hasInputValue(input.rent) && Number(input.rent) > 0;
  const taxesProvided = hasInputValue(input.taxes);
  const insuranceProvided = hasInputValue(input.insurance);
  const hoaProvided = hasInputValue(input.hoa);
  const marketRentEstimate = estimateMarketRent({ ...input, price, propertyType }, location);
  const taxEstimate = taxesProvided ? null : estimatePropertyTaxes(price, location);
  const insuranceEstimate = insuranceProvided ? null : estimateInsurance(price, propertyType, location);
  let rentEstimate: ReturnType<typeof estimateMarketRent> | null = null;
  let rent = Number(input.rent || 0);
  if (!rentProvided) { rentEstimate = marketRentEstimate; rent = rentEstimate.rent; }
  const downPaymentAmount = parseDownPayment(input, price);
  return {
    label: input.label || input.address || input.sourceUrl || '',
    address: input.address || '',
    sourceUrl: input.sourceUrl || input.url || '',
    location, price, rent, rentProvided,
    estimatedRent: !rentProvided,
    estimatedRentConfidence: rentEstimate ? rentEstimate.confidence : null,
    marketRent: marketRentEstimate,
    taxes: taxesProvided ? Number(input.taxes) : (taxEstimate ? taxEstimate.annual : 0),
    insurance: insuranceProvided ? Number(input.insurance) : (insuranceEstimate ? insuranceEstimate.annual : 0),
    hoa: hoaProvided ? Number(input.hoa) : 0,
    taxesProvided, insuranceProvided, hoaProvided,
    taxesEstimated: !taxesProvided && !!taxEstimate,
    insuranceEstimated: !insuranceProvided && !!insuranceEstimate,
    taxEstimate, insuranceEstimate,
    otherMonthlyCosts: Number(input.otherMonthlyCosts || 0),
    rate: input.rate != null ? Number(input.rate) : DEFAULT_RATE,
    termYears: input.termYears != null ? Number(input.termYears) : DEFAULT_TERM_YEARS,
    downPaymentAmount,
    downPaymentPercent: price > 0 ? downPaymentAmount / price : 0,
    vacancyRate: input.vacancyRate != null ? Number(input.vacancyRate) : DEFAULT_VACANCY_RATE,
    repairsRate: input.repairsRate != null ? Number(input.repairsRate) : DEFAULT_REPAIRS_RATE,
    capexRate: input.capexRate != null ? Number(input.capexRate) : DEFAULT_CAPEX_RATE,
    managementRate: input.managementRate != null ? Number(input.managementRate) : DEFAULT_MANAGEMENT_RATE,
    propertyType,
    beds: input.beds != null ? Number(input.beds) : null,
    baths: input.baths != null ? Number(input.baths) : null,
    sqft: input.sqft != null ? Number(input.sqft) : null
  };
}

export function calculateDeal(rawInput: JsonRecord = {}) {
  const input = normalizeDealInput(rawInput);
  const loanAmount = Math.max(input.price - input.downPaymentAmount, 0);
  const monthlyMortgage = calculateMortgagePayment(loanAmount, input.rate, input.termYears);
  const monthlyInterest = loanAmount > 0 ? loanAmount * (input.rate / 12) : 0;
  const monthlyPrincipalPaydown = Math.max(monthlyMortgage - monthlyInterest, 0);
  const monthlyTaxes = annualToMonthly(input.taxes);
  const monthlyInsurance = annualToMonthly(input.insurance);
  const monthlyVacancy = input.rent * input.vacancyRate;
  const monthlyRepairs = input.rent * input.repairsRate;
  const monthlyCapex = input.rent * input.capexRate;
  const monthlyManagement = input.rent * input.managementRate;
  const monthlyOperatingExpense = monthlyTaxes + monthlyInsurance + input.hoa + input.otherMonthlyCosts + monthlyVacancy + monthlyRepairs + monthlyCapex + monthlyManagement;
  const monthlyAllInCost = monthlyMortgage + monthlyOperatingExpense;
  const monthlyCostBeforePrincipal = monthlyOperatingExpense + monthlyInterest;
  const monthlyCashFlow = input.rent - monthlyAllInCost;
  const monthlyCashFlowBeforePrincipal = input.rent - monthlyCostBeforePrincipal;
  const annualNOI = (input.rent * 12) - (monthlyOperatingExpense * 12);
  const annualDebtService = monthlyMortgage * 12;
  const capRate = input.price > 0 ? annualNOI / input.price : 0;
  const grossYield = input.price > 0 ? (input.rent * 12) / input.price : 0;
  const cashOnCashReturn = input.downPaymentAmount > 0 ? ((monthlyCashFlow * 12) / input.downPaymentAmount) : 0;
  const dscr = annualDebtService > 0 ? annualNOI / annualDebtService : 0;
  const breakEvenRent = monthlyAllInCost;

  let score = 5;
  // Only penalize for truly missing data — data our system estimated is not a reason to penalize
  const missingTaxes = !input.taxesProvided && !input.taxesEstimated;
  const missingInsurance = !input.insuranceProvided && !input.insuranceEstimated;
  const missingLikelyHoa = propertyTypeUsuallyHasHoa(input.propertyType) && !input.hoaProvided;

  // Cash flow — thresholds calibrated for 2025+ market with 6.5%+ rates
  if (monthlyCashFlow >= 400) score += 3;
  else if (monthlyCashFlow >= 150) score += 2;
  else if (monthlyCashFlow >= 0) score += 1;
  else if (monthlyCashFlow >= -200) score += 0;
  else if (monthlyCashFlow >= -500) score -= 1;
  else score -= 2;

  // Also reward positive cash flow before principal (equity building counts)
  if (monthlyCashFlow < 0 && monthlyCashFlowBeforePrincipal >= 200) score += 1;

  // Cap rate — realistic for today's market
  if (capRate >= 0.07) score += 2;
  else if (capRate >= 0.055) score += 1;
  else if (capRate < 0.04) score -= 1;

  // Cash-on-cash — adjusted for higher cost of leverage
  if (cashOnCashReturn >= 0.08) score += 2;
  else if (cashOnCashReturn >= 0.04) score += 1;
  else if (cashOnCashReturn < -0.03) score -= 1;

  // Debt coverage
  if (dscr >= 1.25) score += 1;
  else if (dscr > 0 && dscr < 0.9) score -= 1;

  // Only cap/penalize for truly missing (not estimated) data
  if (missingTaxes) score -= 1;
  if (missingInsurance) score -= 1;
  if (missingLikelyHoa) score -= 1;
  if (missingTaxes || missingInsurance) score = Math.min(score, 7);
  if (missingLikelyHoa) score = Math.min(score, 7);

  score = clamp(score, 1, 10);

  let recommendation = 'HOLD';
  if (score >= 8) recommendation = 'BUY';
  else if (score <= 4) recommendation = 'PASS';

  const risks: string[] = [];
  const strengths: string[] = [];
  if (input.estimatedRent) risks.push(`Rent estimated with ${input.estimatedRentConfidence || 'low'} confidence`);
  if (monthlyCashFlow < 0) risks.push('Negative monthly cash flow at current assumptions');
  if (capRate < 0.05) risks.push('Cap rate is weak for a leveraged rental');
  if (cashOnCashReturn < 0.05) risks.push('Cash-on-cash return is modest');
  if (missingTaxes) risks.push('Property taxes are missing, so the model may be optimistic');
  else if (input.taxesEstimated) risks.push(`Property taxes are estimated from ${input.taxEstimate?.state || 'default'} location assumptions; verify the actual tax bill`);
  else if (input.taxes === 0) risks.push('Property taxes are explicitly set to zero');
  if (missingInsurance) risks.push('Insurance is missing, so monthly cost may be understated');
  else if (input.insuranceEstimated) risks.push('Insurance is estimated from property type and location; verify with a quote');
  else if (input.insurance === 0) risks.push('Insurance is explicitly set to zero');
  if (missingLikelyHoa) risks.push('HOA is missing for a condo/townhome-style property, so monthly cost may be understated');
  if (input.rentProvided && input.marketRent?.high && input.rent > input.marketRent.high * 1.05) risks.push('Provided rent is above the model market-rent range; verify with current comps');
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
      score, recommendation,
      breakEvenRent: round(breakEvenRent),
      monthlyMortgage: round(monthlyMortgage),
      monthlyInterest: round(monthlyInterest),
      monthlyPrincipalPaydown: round(monthlyPrincipalPaydown),
      monthlyOperatingExpense: round(monthlyOperatingExpense),
      monthlyAllInCost: round(monthlyAllInCost),
      monthlyCostBeforePrincipal: round(monthlyCostBeforePrincipal),
      monthlyCashFlowBeforePrincipal: round(monthlyCashFlowBeforePrincipal),
      monthlyExpenseBreakdown: {
        mortgage: round(monthlyMortgage), debtPayment: round(monthlyMortgage),
        interest: round(monthlyInterest), principalPaydown: round(monthlyPrincipalPaydown),
        taxes: round(monthlyTaxes), insurance: round(monthlyInsurance),
        hoa: round(input.hoa), otherMonthlyCosts: round(input.otherMonthlyCosts),
        vacancy: round(monthlyVacancy), repairs: round(monthlyRepairs),
        capex: round(monthlyCapex), management: round(monthlyManagement)
      },
      missingInputs: { taxes: missingTaxes, insurance: missingInsurance, hoa: missingLikelyHoa },
      estimatedInputs: { rent: input.estimatedRent, taxes: input.taxesEstimated, insurance: input.insuranceEstimated },
      marketRent: input.marketRent,
      estimatedRent: input.estimatedRent,
      estimatedRentConfidence: input.estimatedRentConfidence
    },
    assumptions: {
      rate: input.rate, termYears: input.termYears,
      downPaymentAmount: round(input.downPaymentAmount),
      downPaymentPercent: round(input.downPaymentPercent, 3),
      vacancyRate: input.vacancyRate, repairsRate: input.repairsRate,
      capexRate: input.capexRate, managementRate: input.managementRate,
      location: input.location, taxEstimate: input.taxEstimate, insuranceEstimate: input.insuranceEstimate
    },
    strengths, risks
  };
}

export function compareDeals(rawDeals: JsonRecord[] = []) {
  const analyses = rawDeals.map((deal, i) => ({ rank: i + 1, label: calculateDeal(deal).input.label || `Deal ${i + 1}`, analysis: calculateDeal(deal) }));
  analyses.sort((a, b) => (b.analysis.summary.score - a.analysis.summary.score) || (b.analysis.summary.monthlyCashFlow - a.analysis.summary.monthlyCashFlow));
  analyses.forEach((item, i) => { item.rank = i + 1; });
  return { bestDealLabel: analyses[0] ? analyses[0].label : null, analyses };
}

// ── Listing parsing ───────────────────────────────────────────────────────────

export function tryParseJson(value: string) {
  try { return JSON.parse(value); } catch { return null; }
}

export function extractMoney(text: unknown, allowSmallBare = false) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/(\$)?\s*([\d,]+)(?:\.\d{2})?/);
  if (!match) return null;
  const digits = match[2].replace(/,/g, '');
  if (!match[1] && !allowSmallBare && digits.length < 4) return null;
  return Number(digits);
}

function hasRentContext(text: string) {
  return /\b(rent|rental|lease)\b/i.test(text);
}

function hasNonRentMonthlyCostContext(text: string) {
  return /\b(hoa|dues?|association|condo\s+fee|mortgage|payment|principal|interest|tax(?:es)?|insurance|piti|assessment)\b/i.test(text);
}

export function normalizePropertyType(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes('single') || s === 'house' || s === 'sfr') return 'Single family';
  if (s.includes('condo') || s.includes('condominium')) return 'Condo';
  if (s.includes('townhouse') || s.includes('townhome')) return 'Townhouse';
  if (s.includes('duplex')) return 'Duplex';
  if (s.includes('triplex')) return 'Triplex';
  if (s.includes('multi') || s.includes('apartment') || s.includes('mf')) return 'Multifamily';
  return raw;
}

export function walkForNumbers(node: unknown, out: JsonRecord, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 12) return;
  if (Array.isArray(node)) return node.forEach(item => walkForNumbers(item, out, depth + 1));
  for (const [key, value] of Object.entries(node)) {
    const k = key.toLowerCase();
    if (typeof value === 'number' && value > 0) {
      if (out.price == null && /listprice|listingprice|askingprice|saleprice|sellingprice|^price$|unformattedprice/.test(k)) out.price = value;
      if (out.rent == null && /rent|rentalestimate|zestimate.*rent/.test(k)) out.rent = value;
      if (out.taxes == null && /taxannual|annualtax|propertytax|taxamount|taxesamount|realestatetax|annualtaxamount|taxesdueannual/.test(k)) out.taxes = value;
      if (out.hoa == null && /hoafee|hoamonthly|hoamonth|hoaamt|hoadues|hoadue|associationfee|condofee|^hoa$/.test(k)) out.hoa = value;
      if (out.beds == null && /^bed|bedroom/.test(k)) out.beds = value;
      if (out.baths == null && /^bath|bathroom/.test(k)) out.baths = value;
      if (out.sqft == null && /sqft|squarefeet|floorarea|livingarea|finishedsqft/.test(k)) out.sqft = value;
    } else if (typeof value === 'string' && value.length < 300) {
      const addressMatch = value.match(/\d+ .+, [A-Za-z .'-]+, [A-Z]{2} \d{5}/);
      if (!out.address && addressMatch) out.address = addressMatch[0];
      if (!out.propertyType && /propertytype|hometype|^type$|propertystyle/.test(k)) out.propertyType = normalizePropertyType(value);
      const money = extractMoney(value, /hoa|associationfee|condofee/.test(k));
      if (money != null && money > 0) {
        if (out.price == null && /listprice|listingprice|price|amount/.test(k)) out.price = money;
        if (out.rent == null && /rent/.test(k)) out.rent = money;
        if (out.taxes == null && /tax/.test(k)) out.taxes = money;
        if (out.hoa == null && /hoa|associationfee|condofee/.test(k)) out.hoa = money;
      }
    }
    walkForNumbers(value, out, depth + 1);
  }
}

export function parseListingText(text: unknown, sourceUrl = ''): JsonRecord {
  const bodyText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!bodyText) return {};
  const result: JsonRecord = { sourceUrl, address: '', propertyType: '', price: null, rent: null, taxes: null, hoa: null, insurance: null, beds: null, baths: null, sqft: null, parserNotes: [] };
  const addressMatch = bodyText.match(/\d{1,6}\s+[A-Za-z0-9.'\- ]+,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\s*\d{5}/);
  if (addressMatch) result.address = addressMatch[0].trim();
  const propertyTypeMatch = bodyText.match(/\b(single[\s-]family|multifamily|multi[\s-]family|duplex|triplex|quadruplex|condo(?:minium)?|townhome|townhouse|apartment)\b/i);
  if (propertyTypeMatch) result.propertyType = normalizePropertyType(propertyTypeMatch[1]);
  for (const pattern of [
    /(?:list(?:ing)?\s+price|listed\s+for|asking\s+price|price)\s*:?\s*(\$[\d,]+)/i,
    /(?:sold\s+for|sale\s+price|last\s+sold)\s*:?\s*(\$[\d,]+)/i,
    /(\$[\d,]{5,})/
  ]) {
    const match = bodyText.match(pattern);
    if (match) { result.price = extractMoney(match[1]); break; }
  }
  // HOA — parse before rent so the greedy $X/mo rent fallback doesn't steal HOA amounts
  const hoaMatch = bodyText.match(/hoa(?:\s+(?:fee|dues|due))?\s*:?\s*(\$[\d,]+)\s*(?:\/\s*mo(?:nth)?)?/i)
    || bodyText.match(/(\$[\d,]+)\s*(?:\/\s*mo[a-z]*)?\s+hoa\s*(?:dues?|fee)?/i)
    || bodyText.match(/(?:homeowner[s']?\s+assoc[^$]{0,30})\s*(\$[\d,]+)/i);
  if (hoaMatch) result.hoa = extractMoney(hoaMatch[1], true);
  const hoaAmountStr = result.hoa != null ? String(result.hoa) : null;
  for (const pattern of [
    /(?:monthly\s+rent|estimated\s+rent|rent(?:\s+estimate)?)\s*:?\s*(\$[\d,]+)/i,
    /\b(?:rent|rental|lease)\b[^$]{0,80}(\$[\d,]+)\s*\/\s*mo(?:nth)?/i,
    /(\$[\d,]+)\s*\/\s*mo(?:nth)?[^.]{0,80}\b(?:rent|rental|lease)\b/i
  ]) {
    const match = bodyText.match(pattern);
    if (match) {
      const val = extractMoney(match[1] || match[0]);
      if (hoaAmountStr && String(val) === hoaAmountStr) continue;
      result.rent = val; break;
    }
  }
  if (result.rent == null) {
    for (const match of bodyText.matchAll(/(\$[\d,]+)\s*\/\s*mo(?:nth)?/gi)) {
      const val = extractMoney(match[1] || match[0]);
      if (val == null || (hoaAmountStr && String(val) === hoaAmountStr)) continue;
      const index = match.index ?? 0;
      const context = bodyText.slice(Math.max(0, index - 80), index + match[0].length + 80);
      if (hasNonRentMonthlyCostContext(context) && !hasRentContext(context)) continue;
      result.rent = val;
      break;
    }
  }
  const annualTaxMatch = bodyText.match(/(?:property\s+)?tax(?:es)?\s*:?\s*(\$[\d,]+)\s*(?:\/\s*(?:yr|year)|per\s+year|annually)/i)
    || bodyText.match(/(?:property\s+)?tax(?:es)?\s*:?\s*(\$[\d,]+)/i);
  if (annualTaxMatch) {
    const val = extractMoney(annualTaxMatch[1]);
    const monthly = /\/\s*mo/.test(annualTaxMatch[0]);
    result.taxes = val != null ? (monthly ? val * 12 : val) : null;
  }
  const bedsMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*(?:bed(?:room)?s?)\b/i);
  if (bedsMatch) result.beds = Number(bedsMatch[1]);
  const bathsMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*(?:bath(?:room)?s?)\b/i);
  if (bathsMatch) result.baths = Number(bathsMatch[1]);
  const sqftMatch = bodyText.match(/([\d,]+)\s*(?:sq\.?\s*ft\.?|square\s*feet)/i);
  if (sqftMatch) result.sqft = Number(sqftMatch[1].replace(/,/g, ''));
  return result;
}

export function extractStructuredDataFromHtml(html: string, sourceUrl = ''): JsonRecord {
  const $ = cheerio.load(html);
  const result: JsonRecord = { sourceUrl, address: '', propertyType: '', price: null, rent: null, taxes: null, hoa: null, insurance: null, beds: null, baths: null, sqft: null, parserNotes: [] };
  const metaCandidates = [$('meta[property="og:title"]').attr('content'), $('title').text(), $('meta[name="description"]').attr('content')].filter(Boolean).join(' | ');
  Object.assign(result, parseListingText(metaCandidates, sourceUrl));
  result.photoUrl = $('meta[property="og:image"]').attr('content') || null;

  const scripts = $('script').map((_, el) => ({ type: $(el).attr('type') || '', id: $(el).attr('id') || '', content: $(el).html() || '' })).get();
  for (const { type, id, content } of scripts) {
    const trimmed = content.trim();
    if (!trimmed) continue;
    let parsed: unknown = null;
    if (type === 'application/ld+json') parsed = tryParseJson(trimmed);
    else if (id === '__NEXT_DATA__') parsed = tryParseJson(trimmed);
    else if (trimmed.startsWith('{') || trimmed.startsWith('[')) parsed = tryParseJson(trimmed);
    else {
      const assignMatch = trimmed.match(/(?:window\.\w+|var\s+\w+)\s*=\s*(\{[\s\S]{20,})/);
      if (assignMatch) parsed = tryParseJson(assignMatch[1].replace(/;\s*$/, ''));
    }
    if (parsed) walkForNumbers(parsed, result);
  }

  const bodyText = $('body').text().replace(/\s+/g, ' ');
  const fallback = parseListingText(bodyText, sourceUrl);
  const parserNotes: string[] = [];
  if (sourceUrl.includes('redfin')) parserNotes.push('Applied Redfin-friendly heuristics');
  if (sourceUrl.includes('zillow')) parserNotes.push('Applied Zillow-friendly heuristics');
  const hoaSnippet = bodyText.match(/.{0,60}hoa.{0,60}/i)?.[0] || null;
  const taxSnippet = bodyText.match(/.{0,60}tax.{0,60}/i)?.[0] || null;
  return {
    sourceUrl,
    address: result.address || fallback.address || '',
    propertyType: result.propertyType || fallback.propertyType || '',
    price: result.price ?? fallback.price ?? null,
    rent: result.rent ?? fallback.rent ?? null,
    taxes: result.taxes ?? fallback.taxes ?? null,
    hoa: result.hoa ?? fallback.hoa ?? null,
    insurance: result.insurance ?? fallback.insurance ?? null,
    beds: result.beds ?? fallback.beds ?? null,
    baths: result.baths ?? fallback.baths ?? null,
    sqft: result.sqft ?? fallback.sqft ?? null,
    photoUrl: result.photoUrl || null,
    parserNotes,
    extracted: { bodyTextPreview: bodyText.slice(0, 3000), hoaSnippet, taxSnippet }
  };
}

export async function parseListing(input: JsonRecord = {}) {
  const url = input.url || input.sourceUrl || '';
  const listingText = input.listingText || '';
  if (listingText) return parseListingText(listingText, url);
  if (!url) throw new Error('Provide url or listingText');
  const ua = input._userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const response = await axios.get(url, {
    timeout: 12000,
    headers: {
      'User-Agent': ua,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache', 'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none', 'Upgrade-Insecure-Requests': '1',
    }
  });
  return extractStructuredDataFromHtml(response.data, url);
}

export function mergeListingWithOverrides(parsed: JsonRecord, overrides: JsonRecord) {
  const merged = { ...parsed };
  for (const [key, value] of Object.entries(overrides)) {
    if (!hasInputValue(value)) continue;
    merged[key] = value;
  }
  merged.sourceUrl = overrides.url || parsed.sourceUrl;
  return merged;
}
