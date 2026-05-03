import { ScoreBadge } from '../components/ui/ScoreBadge';
import { MetricCard } from '../components/ui/MetricCard';

function currentHost() {
  if (typeof window === 'undefined') return 'localhost:3000';
  return window.location.host;
}

export function HomePage() {
  const host = currentHost();
  const importedFields = ['Address', 'Price', 'Taxes est.', 'Rent est.'];
  const underwritingAssumptions = ['20% down', '6.5% rate', '30y loan'];
  const decisionReasons = ['Positive monthly cash flow', 'Cap rate clears baseline', 'Editable assumptions before saving'];

  return (
    <div className="grid gap-14">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="grid gap-10 pt-4 xl:grid-cols-[minmax(0,1.1fr),minmax(340px,400px)] xl:items-start">
        <div className="max-w-3xl">
          <p className="section-kicker">Rental deal analysis</p>

          <h1 className="mt-4 font-display text-5xl font-800 leading-[0.95] tracking-tight md:text-6xl xl:text-[5rem]">
            Underwrite any rental
            <br />
            <span className="verdict-buy">in 30 seconds.</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-muted">
            Paste a Zillow or Redfin link and get cash flow, cap rate, DSCR, and a scored
            BUY / HOLD / PASS verdict — with every assumption visible and editable.
            No spreadsheet required.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="/quick-check"
              className="rounded-xl border border-gold/50 bg-gold/15 px-6 py-3 text-sm font-semibold text-gold transition hover:bg-gold/25 hover:border-gold/70"
            >
              Analyze a deal free →
            </a>
            <a
              href="#pricing"
              className="rounded-xl border border-line px-6 py-3 text-sm font-medium text-muted hover:border-line/80 hover:text-ink"
            >
              See pricing
            </a>
          </div>
          <p className="mt-3 font-mono text-xs text-muted/50">No account needed to start. 3 saves free, then $9/mo.</p>

          {/* Live metrics preview */}
          <div className="mt-10 grid gap-2 sm:grid-cols-3">
            <MetricCard
              label="Verdict"
              value={<span className="verdict-buy">BUY</span>}
              hint="8.2 / 10 score"
              compact
              tone="positive"
            />
            <MetricCard label="After debt" value="+$412" hint="Monthly cash flow" compact tone="positive" />
            <MetricCard label="Break-even rent" value="$1,840" hint="Know your floor" compact />
          </div>

          {/* Feature chips */}
          <div className="mt-5 flex flex-wrap gap-2">
            {['Import Zillow or Redfin', 'BUY / HOLD / PASS instantly', 'Save and compare later'].map((f) => (
              <span key={f} className="rounded-lg border border-line px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted/70">
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* ── Demo panel ── */}
        <div className="surface-panel overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-gold/60" />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted/60">Example run</span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold/60">30s</span>
          </div>

          <div className="grid gap-3 p-5">
            {/* Input */}
            <div className="rounded-xl border border-line bg-page/50 p-4">
              <p className="section-kicker mb-3">Input</p>
              <div className="rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-xs text-muted/80">
                redfin.com/TX/Austin/example-rental
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {importedFields.map((item) => (
                  <span key={item} className="rounded-lg border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted/60">
                    ✓ {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Decision */}
            <div className="rounded-xl border border-green/20 bg-green-soft p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="section-kicker mb-2">Decision</p>
                  <h3 className="font-display text-lg font-700 text-ink">Worth a closer look</h3>
                </div>
                <ScoreBadge recommendation="BUY" score={8.2} />
              </div>
              <div className="mt-4 grid gap-1.5">
                {decisionReasons.map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-lg border border-green/10 bg-surface/40 px-3 py-2">
                    <span className="text-green text-xs">↗</span>
                    <span className="text-xs text-ink/80">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Assumptions */}
            <div className="rounded-xl border border-line bg-page/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="section-kicker">Assumptions</p>
                <a
                  href="/add"
                  className="rounded-lg border border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted/70 hover:text-ink"
                >
                  Edit →
                </a>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {underwritingAssumptions.map((item) => (
                  <span key={item} className="rounded-lg border border-blue/20 bg-blue-soft px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-blue/80">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <MetricCard label="Monthly cash flow" value="+$412" compact tone="positive" />
              <MetricCard label="Cap rate" value="6.4%" compact />
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section>
        <p className="section-kicker">How it works</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {([
            ['01', 'Import a listing', 'Paste a Zillow or Redfin URL and the app auto-fills address, price, taxes, and HOA. Rent gets estimated from market data if you leave it blank.'],
            ['02', 'See the full underwrite', 'Cash flow after debt, cap rate, cash-on-cash return, DSCR, break-even rent, and a 1–10 score — all on one screen, all with editable assumptions.'],
            ['03', 'Save and compare', 'Keep a running pipeline of scored deals. Compare them side by side, rank by return, and access the same analysis inside Claude.ai or ChatGPT.'],
          ] as const).map(([step, title, body]) => (
            <div key={step} className="surface-panel p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold/50">{step}</p>
              <h2 className="mt-3 font-display text-lg font-700 tracking-tight text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Integrations ─────────────────────────────────────────────── */}
      <section>
        <p className="section-kicker">Use it where you already work</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {([
            ['W', 'Web app', 'Live', null, 'Full analysis workspace in the browser. Import listings, edit assumptions, save deals, and compare your pipeline — no install.'],
            ['C', 'Claude.ai', 'MCP integration', host, 'Add as an MCP server in Claude settings. Paste any listing link in chat and get a full underwrite inline.'],
            ['G', 'ChatGPT', 'Connector', `${host}/mcp`, 'Connect via ChatGPT connector settings. Ask "is this a good deal?" and share a listing link — it runs the full analysis.'],
          ] as const).map(([icon, name, tag, endpoint, desc]) => (
            <div key={name} className="surface-panel p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-page font-display text-sm font-700 text-gold">
                  {icon}
                </div>
                <div>
                  <p className="font-display text-base font-700 tracking-tight text-ink">{name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted/60">{tag}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-muted">{desc}</p>
              {endpoint ? (
                <code className="mt-4 block rounded-lg border border-line bg-page px-3 py-2.5 font-mono text-xs text-muted/70">
                  {endpoint}
                </code>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing">
        <p className="section-kicker">Pricing</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {/* Free */}
          <div className="surface-panel p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted/60">Free</p>
            <p className="mt-4 font-display text-5xl font-800 tracking-tight text-ink">$0</p>
            <p className="mt-3 text-sm leading-6 text-muted">No credit card. No account needed to start analyzing.</p>
            <ul className="mt-6 grid gap-2.5 text-sm text-muted">
              {['Unlimited quick analyses', 'Zillow and Redfin import', 'Save up to 3 deals', 'Claude.ai and ChatGPT MCP access'].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-muted/50">—</span> {f}
                </li>
              ))}
            </ul>
            <a
              href="/quick-check"
              className="mt-8 inline-flex rounded-xl border border-line px-6 py-3 text-sm font-medium text-muted hover:border-line/80 hover:text-ink"
            >
              Start for free
            </a>
          </div>

          {/* Pro */}
          <div className="surface-panel border-gold/30 bg-gold-soft p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold/70">Pro</p>
            <p className="mt-4 font-display text-5xl font-800 tracking-tight text-ink">
              $9{' '}
              <span className="font-sans text-lg font-normal text-muted">/ month</span>
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">For investors who run 5 to 50 deals a month and need to move fast.</p>
            <ul className="mt-6 grid gap-2.5 text-sm text-muted">
              {['Unlimited saved deals', 'Side-by-side deal comparison', 'Export to PDF and CSV', 'Priority support'].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-gold/60">—</span> {f}
                </li>
              ))}
            </ul>
            <a
              href="/billing/checkout"
              className="mt-8 inline-flex rounded-xl border border-gold/50 bg-gold/15 px-6 py-3 text-sm font-semibold text-gold hover:bg-gold/25 hover:border-gold/70 transition"
            >
              Get Pro →
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="flex flex-col gap-3 border-t border-line/50 pt-6 md:flex-row md:items-center md:justify-between">
        <span className="font-mono text-xs text-muted/50">© 2025 Deal Analyzer</span>
        <div className="flex flex-wrap gap-4">
          <a href="/privacy" className="font-mono text-xs text-muted/50 hover:text-muted">Privacy</a>
          <a href="/terms" className="font-mono text-xs text-muted/50 hover:text-muted">Terms</a>
        </div>
      </footer>
    </div>
  );
}
