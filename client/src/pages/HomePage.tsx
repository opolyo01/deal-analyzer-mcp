function currentHost() {
  if (typeof window === 'undefined') return 'localhost:3000';
  return window.location.host;
}

export function HomePage() {
  const host = currentHost();

  return (
    <div className="grid gap-10">
      <section className="grid gap-8 pt-6 lg:grid-cols-[minmax(0,1fr),minmax(320px,420px)] lg:items-center">
        <div className="max-w-2xl">
          <p className="section-kicker">Rental investing, faster</p>
          <h1 className="mt-3 text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
            Know if a rental is worth it <span className="text-green">in 30 seconds.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted">
            Paste a Zillow or Redfin link, or enter a few numbers, and get cash flow, cap rate, and a BUY / HOLD / PASS score
            instantly. No spreadsheet. No guessing.
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
        </div>

        <div className="surface-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-page/80 px-5 py-4 text-sm text-muted">
            <span className="font-semibold text-ink">123 Maple St, Austin TX</span>
            <span className="rounded-full border border-green/20 bg-green-soft px-3 py-1 text-xs font-semibold text-green">8.2 / 10</span>
          </div>

          <div className="p-5">
            <div className="inline-flex rounded-full border border-green/20 bg-green-soft px-4 py-2 text-sm font-semibold text-green">BUY</div>

            <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-line bg-line">
              <div className="bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Monthly cash flow</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-green">+$412</p>
              </div>
              <div className="bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Cap rate</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">6.4%</p>
              </div>
              <div className="bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Cash-on-cash</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">8.1%</p>
              </div>
              <div className="bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Break-even rent</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">$1,840</p>
              </div>
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
          <a href="/agent" className="hover:text-ink">
            Talk to an investor-friendly realtor
          </a>
        </div>
      </footer>
    </div>
  );
}
