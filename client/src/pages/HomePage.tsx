import { ScoreBadge } from '../components/ui/ScoreBadge';
import { MetricCard } from '../components/ui/MetricCard';

function currentHost() {
  if (typeof window === 'undefined') return 'localhost:3000';
  return window.location.host;
}

export function HomePage() {
  const host = currentHost();
  const importedFields = ['Address imported', 'Price imported', 'Taxes est.', 'Rent est.'];
  const underwritingAssumptions = ['20% down', '6.5% rate', '30y loan'];
  const decisionReasons = ['Positive monthly cash flow', 'Cap rate clears baseline', 'Editable assumptions before saving'];

  return (
    <div className="grid gap-10">
      <section className="grid gap-8 pt-6 xl:grid-cols-[minmax(0,1.08fr),minmax(360px,420px)] xl:items-start">
        <div className="max-w-3xl">
          <p className="section-kicker">Rental investing, faster</p>
          <h1 className="mt-3 text-5xl font-semibold leading-[0.98] tracking-tight md:text-6xl xl:text-[5.25rem]">
            Know if a rental is worth it <span className="text-green">in 30 seconds.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted">
            Paste a Zillow or Redfin link, let the app pull in the messy details, and get a clear buy / hold / pass call with the
            numbers behind it. No spreadsheet. No guessing.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/quick-check"
              className="rounded-full border border-green bg-green px-6 py-3 text-sm font-semibold text-white hover:brightness-95"
            >
              Try it free
            </a>
            <a
              href="#pricing"
              className="rounded-full border border-line bg-white px-6 py-3 text-sm font-semibold text-ink hover:border-muted/40"
            >
              See pricing
            </a>
          </div>

          <p className="mt-4 text-sm text-muted">Free forever for quick checks. Three saves free, then $9/month.</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <MetricCard
              label="Decision"
              value={<span className="text-green">BUY</span>}
              hint="8.2 / 10 score"
              compact
              tone="positive"
            />
            <MetricCard label="After debt" value="+$412" hint="Monthly cash flow" compact tone="positive" />
            <MetricCard label="Break-even rent" value="$1,840" hint="Know your floor fast" compact />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">Import Zillow or Redfin</span>
            <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">See BUY / HOLD / PASS instantly</span>
            <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">Save and compare later</span>
          </div>
        </div>

        <div className="surface-panel overflow-hidden">
          <div className="border-b border-line bg-page/85 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Example workflow</p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-ink">Listing in. Underwriting out.</h2>
              </div>
              <span className="rounded-full border border-blue/20 bg-blue-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue">
                30-second pass
              </span>
            </div>
          </div>

          <div className="grid gap-4 p-5">
            <div className="rounded-2xl border border-line/70 bg-page/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Imported from listing</p>
              <div className="mt-3 rounded-2xl border border-line bg-white px-4 py-3 font-mono text-xs leading-5 text-muted">
                redfin.com/TX/Austin/example-rental
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {importedFields.map((item) => (
                  <span key={item} className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-green/20 bg-green-soft/55 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Decision</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-ink">Worth a closer look</h3>
                </div>
                <ScoreBadge recommendation="BUY" score={8.2} />
              </div>
              <div className="mt-4 grid gap-2">
                {decisionReasons.map((item) => (
                  <div key={item} className="rounded-2xl border border-white/80 bg-white/75 px-3 py-2 text-sm font-medium text-ink">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-line/70 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Underwriting assumptions</p>
                  <p className="mt-2 text-sm leading-6 text-muted">Editable inputs that drive the score and cash flow.</p>
                </div>
                <a
                  href="/add"
                  className="rounded-full border border-line bg-page px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink hover:border-muted/40"
                >
                  Open full analysis
                </a>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {underwritingAssumptions.map((item) => (
                  <span key={item} className="rounded-full border border-blue/20 bg-blue-soft px-3 py-1 text-xs font-medium text-blue">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Monthly cash flow" value="+$412" compact tone="positive" />
              <MetricCard label="Cap rate" value="6.4%" compact />
            </div>
          </div>
        </div>
      </section>

      <section>
        <p className="section-kicker">How it works</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {[
            ['1', 'Paste a listing URL', 'Zillow or Redfin import auto-fills price, taxes, HOA, and beds. Rent can be estimated if you skip it.'],
            ['2', 'Get the full picture', 'Cash flow, cap rate, cash-on-cash return, DSCR, break-even rent, and a 1–10 score in one screen.'],
            ['3', 'Save and move fast', 'Rank your best deals, compare them side by side, and use the same app in Claude.ai and ChatGPT.'],
          ].map(([step, title, body]) => (
            <div key={step} className="surface-panel p-6">
              <div className="flex items-start gap-4">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-green-soft text-sm font-semibold text-green">{step}</div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="section-kicker">Use it where you already work</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="surface-panel p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl border border-line bg-page">W</div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Web app</h2>
                <p className="text-sm text-muted">Live</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">Analyze, save, and compare deals directly in the browser. No install required.</p>
          </div>

          <div className="surface-panel p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl border border-line bg-page">C</div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Claude.ai</h2>
                <p className="text-sm text-muted">MCP integration</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">
              Add it as an MCP integration in Claude and paste a listing link in chat for a full analysis.
            </p>
            <code className="mt-4 block rounded-2xl border border-line bg-page px-4 py-3 text-xs text-muted">{host}</code>
          </div>

          <div className="surface-panel p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl border border-line bg-page">G</div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight">ChatGPT</h2>
                <p className="text-sm text-muted">Connector</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted">
              Add the MCP server in ChatGPT settings and ask whether a property is a good deal.
            </p>
            <code className="mt-4 block rounded-2xl border border-line bg-page px-4 py-3 text-xs text-muted">{host}/mcp</code>
          </div>
        </div>
      </section>

      <section id="pricing">
        <p className="section-kicker">Pricing</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="surface-panel p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Free</p>
            <p className="mt-3 text-5xl font-semibold tracking-tight">$0</p>
            <p className="mt-4 text-sm leading-6 text-muted">No credit card. No account needed to start analyzing.</p>
            <ul className="mt-6 grid gap-3 text-sm text-ink">
              <li>Unlimited quick analyses</li>
              <li>Zillow and Redfin import</li>
              <li>Save up to 3 deals</li>
              <li>Claude.ai and ChatGPT MCP access</li>
            </ul>
            <a
              href="/quick-check"
              className="mt-8 inline-flex rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink hover:border-muted/40"
            >
              Start for free
            </a>
          </div>

          <div className="surface-panel border-green/30 bg-green-soft/70 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-green">Pro</p>
            <p className="mt-3 text-5xl font-semibold tracking-tight">
              $9 <span className="text-lg font-medium text-muted">/ month</span>
            </p>
            <p className="mt-4 text-sm leading-6 text-muted">For investors who run 5 to 50 deals a month and need to move fast.</p>
            <ul className="mt-6 grid gap-3 text-sm text-ink">
              <li>Unlimited saved deals</li>
              <li>Side-by-side deal comparison</li>
              <li>Export to PDF and CSV</li>
              <li>Priority support</li>
            </ul>
            <a
              href="/billing/checkout"
              className="mt-8 inline-flex rounded-full border border-green bg-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
            >
              Get Pro
            </a>
          </div>
        </div>
      </section>

      <footer className="flex flex-col gap-3 border-t border-line/80 pt-6 text-sm text-muted md:flex-row md:items-center md:justify-between">
        <span>© 2025 Deal Analyzer</span>
        <div className="flex flex-wrap gap-4">
          <a href="/privacy" className="hover:text-ink">
            Privacy
          </a>
          <a href="/terms" className="hover:text-ink">
            Terms
          </a>
        </div>
      </footer>
    </div>
  );
}
