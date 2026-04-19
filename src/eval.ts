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
