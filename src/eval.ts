/**
 * MCP tool eval — checks that each prompt drives the right tool
 * and that the response contains expected fields.
 *
 * Run: npx tsx src/eval.ts [base-url]
 * Default base-url: http://localhost:3000
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';

interface Case {
  prompt: string;
  tool: string;
  args: Record<string, unknown>;
  expect: (result: Record<string, unknown>) => string | null; // null = pass, string = fail reason
}

const cases: Case[] = [
  // ── analyzeDeal ───────────────────────────────────────────────────────────
  {
    prompt: 'is 1043 dale ave mountain view ca 1.3m good deal',
    tool: 'analyzeDeal',
    args: { price: 1300000, address: '1043 Dale Ave, Mountain View, CA', label: '1043 Dale Ave', propertyType: 'Single family' },
    expect: r => {
      const s = (r as any).summary;
      if (!s) return 'missing summary';
      if (typeof s.score !== 'number') return 'missing score';
      if (!['BUY','HOLD','PASS'].includes(s.recommendation)) return `bad recommendation: ${s.recommendation}`;
      if (typeof s.monthlyCashFlow !== 'number') return 'missing monthlyCashFlow';
      if (typeof s.breakEvenRent !== 'number') return 'missing breakEvenRent';
      return null;
    }
  },
  {
    prompt: 'analyze deal: price 425000, rent 3200, taxes 6100, insurance 2100, HOA 0, 20% down, 6.5% rate',
    tool: 'analyzeDeal',
    args: { price: 425000, rent: 3200, taxes: 6100, insurance: 2100, hoa: 0, downPaymentPercent: 0.20, rate: 0.065 },
    expect: r => {
      const s = (r as any).summary;
      if (!s) return 'missing summary';
      if (s.score < 1 || s.score > 10) return `score out of range: ${s.score}`;
      if (typeof s.capRate !== 'number') return 'missing capRate';
      if (typeof s.cashOnCashReturn !== 'number') return 'missing cashOnCashReturn';
      return null;
    }
  },
  {
    prompt: 'quick check: duplex $650k, estimated rent $4800/mo',
    tool: 'analyzeDeal',
    args: { price: 650000, rent: 4800, propertyType: 'Duplex' },
    expect: r => {
      const inp = (r as any).input;
      if (!inp) return 'missing input';
      if (inp.estimatedRent) return 'rent was provided but marked as estimated';
      return null;
    }
  },
  {
    prompt: 'score this: $300k single family, no rent info',
    tool: 'analyzeDeal',
    args: { price: 300000 },
    expect: r => {
      const inp = (r as any).input;
      if (!inp?.estimatedRent) return 'rent should be estimated when not provided';
      const risks: string[] = (r as any).risks ?? [];
      if (!risks.some(x => /tax/i.test(x))) return 'should warn about missing taxes';
      return null;
    }
  },
  {
    prompt: 'do not recommend BUY when condo expenses are missing',
    tool: 'analyzeDeal',
    args: { price: 289000, rent: 2168, propertyType: 'Condo' },
    expect: r => {
      const s = (r as any).summary;
      if (!s) return 'missing summary';
      if (s.recommendation === 'BUY') return 'missing condo expenses should not produce BUY';
      if (!s.missingInputs?.hoa) return 'expected missing HOA flag';
      if (!s.estimatedInputs?.taxes) return 'expected estimated taxes flag';
      if (!s.estimatedInputs?.insurance) return 'expected estimated insurance flag';
      if (s.monthlyExpenseBreakdown.taxes <= 0) return 'expected estimated taxes in expense breakdown';
      if (s.monthlyExpenseBreakdown.insurance <= 0) return 'expected estimated insurance in expense breakdown';
      return null;
    }
  },
  {
    prompt: 'estimate market rent from provided comps when rent is missing',
    tool: 'analyzeDeal',
    args: { price: 400000, propertyType: 'Single family', state: 'IL', rentComps: [{ rent: 1800 }, { rent: 2000 }, { rent: 2200 }] },
    expect: r => {
      const input = (r as any).input;
      const s = (r as any).summary;
      if (!input || !s) return 'missing input or summary';
      if (input.rent !== 2000) return `expected comp-derived rent 2000, got ${input.rent}`;
      if (s.marketRent?.compsUsed !== 3) return `expected 3 comps used, got ${s.marketRent?.compsUsed}`;
      return null;
    }
  },

  // ── analyzeListing ────────────────────────────────────────────────────────
  {
    prompt: 'is this a good deal? https://www.redfin.com/IL/Wheeling/1048-Harbour-Ct-60090/unit-2B/home/184338215',
    tool: 'analyzeListing',
    args: { url: 'https://www.redfin.com/IL/Wheeling/1048-Harbour-Ct-60090/unit-2B/home/184338215' },
    expect: r => {
      const s = (r as any).summary;
      if (!s) return 'missing summary';
      if (typeof s.score !== 'number') return 'missing score';
      const parsed = (r as any).parsedListing;
      if (!parsed) return 'missing parsedListing';
      if (!parsed.price) return 'parser did not extract price';
      return null;
    }
  },
  {
    prompt: 'parse listing text should not treat estimated payment as rent',
    tool: 'parseListing',
    args: { listingText: 'Condo for sale. Price $289,000. Est. payment $2,100/mo. $432/mo HOA Dues.' },
    expect: r => {
      if ((r as any).rent != null) return `expected no rent, got ${(r as any).rent}`;
      if ((r as any).hoa !== 432) return `expected HOA 432, got ${(r as any).hoa}`;
      return null;
    }
  },
  {
    prompt: 'caller-provided listing fields should override parser guesses',
    tool: 'analyzeListing',
    args: { listingText: 'Condo for sale. Price $289,000. Estimated rent $1,200/mo. $300/mo HOA Dues. Property taxes $3,400/year.', rent: 2168, hoa: 432 },
    expect: r => {
      const input = (r as any).input;
      if (!input) return 'missing input';
      if (input.rent !== 2168) return `expected override rent 2168, got ${input.rent}`;
      if (input.hoa !== 432) return `expected override HOA 432, got ${input.hoa}`;
      return null;
    }
  },
  {
    prompt: 'null listing overrides should not erase parsed fields',
    tool: 'analyzeListing',
    args: { listingText: 'Condo for sale. Price $289,000. Estimated rent $1,200/mo. $300/mo HOA Dues. Property taxes $3,400/year.', rent: null, hoa: null },
    expect: r => {
      const input = (r as any).input;
      if (!input) return 'missing input';
      if (input.rent !== 1200) return `expected parsed rent 1200, got ${input.rent}`;
      if (input.hoa !== 300) return `expected parsed HOA 300, got ${input.hoa}`;
      return null;
    }
  },
  {
    prompt: 'parse condo listing text with $432/mo HOA dues',
    tool: 'parseListing',
    args: { listingText: 'Condo for sale. Price $289,000. 3 beds, 2 baths, 1,500 square feet. Est. rent $2,168/mo. $432/mo HOA Dues. Property taxes $3,400/year.' },
    expect: r => {
      if ((r as any).hoa !== 432) return `expected HOA 432, got ${(r as any).hoa}`;
      if ((r as any).rent !== 2168) return `expected rent 2168, got ${(r as any).rent}`;
      if ((r as any).price !== 289000) return `expected price 289000, got ${(r as any).price}`;
      return null;
    }
  },

  // ── compareDeals ──────────────────────────────────────────────────────────
  {
    prompt: 'compare deal A ($400k, $2800 rent) vs deal B ($550k, $3600 rent)',
    tool: 'compareDeals',
    args: {
      deals: [
        { label: 'Deal A', price: 400000, rent: 2800 },
        { label: 'Deal B', price: 550000, rent: 3600 },
      ]
    },
    expect: r => {
      const analyses = (r as any).analyses;
      if (!Array.isArray(analyses) || analyses.length !== 2) return 'expected 2 analyses';
      if (!analyses[0].rank || !analyses[1].rank) return 'missing rank';
      if (!(r as any).bestDealLabel) return 'missing bestDealLabel';
      return null;
    }
  },

  // ── getDeals ──────────────────────────────────────────────────────────────
  {
    prompt: 'show my saved deals',
    tool: 'getDeals',
    args: {},
    expect: r => {
      // Unauthenticated locally returns []; authenticated returns array of deals
      if (!Array.isArray(r)) return `expected array, got ${typeof r}`;
      return null;
    }
  },
];

async function callTool(tool: string, args: Record<string, unknown>) {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } }),
  });
  const json = await res.json() as any;
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result?.structuredContent ?? json.result;
}

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red   = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim   = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function run() {
  console.log(`\nRunning ${cases.length} eval cases against ${BASE}\n`);
  let passed = 0, failed = 0;

  for (const c of cases) {
    process.stdout.write(`  [${c.tool}] ${dim(c.prompt.slice(0, 60))} … `);
    try {
      const result = await callTool(c.tool, c.args);
      const fail = c.expect(result);
      if (fail) {
        console.log(red(`FAIL — ${fail}`));
        failed++;
      } else {
        console.log(green('PASS'));
        passed++;
      }
    } catch (err: any) {
      console.log(red(`ERROR — ${err.message}`));
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
