import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAgentConfig } from '../lib/api';
import { errorMessage } from '../lib/format';
import type { AgentConfig } from '../lib/types';

const defaultAgent: AgentConfig = {
  name: 'Tonya Trachuk',
  photo: '',
  brokerage: 'Core Realty & Investments',
  phone: '',
  email: 'tonya@corerealty.com',
  bio:
    "Tonya Trachuk isn't just your typical real estate agent — she's a seasoned investor and expert negotiator with a Master's in Marketing, ready to help you navigate the real estate world. Whether you're selling, buying, investing, or leasing, she uses her marketing skills and real-world experience to get you the best results.",
  zillowUrl: '',
  licenseNumber: '',
};

function initials(name: string) {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function AgentPage() {
  const [agent, setAgent] = useState<AgentConfig>(defaultAgent);
  const [showSetupNotice, setShowSetupNotice] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    goal: '',
    listing: '',
    message: '',
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const config = await getAgentConfig();
        if (!cancelled) {
          const merged = { ...defaultAgent, ...config };
          setShowSetupNotice(!config.name && !config.photo && !config.email && !config.phone);
          setAgent(merged);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setLoadError(errorMessage(caughtError, 'Could not load agent profile settings.'));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim() || !form.email.trim()) {
      setFormError('Name and email are required.');
      return;
    }

    setFormError(null);

    const subject = `Deal Analyzer inquiry from ${form.name.trim()}`;
    const body = [
      `Name: ${form.name.trim()}`,
      `Email: ${form.email.trim()}`,
      form.phone.trim() ? `Phone: ${form.phone.trim()}` : null,
      form.goal ? `Goal: ${form.goal}` : null,
      form.listing.trim() ? `Listing: ${form.listing.trim()}` : null,
      form.message.trim() ? `\nMessage:\n${form.message.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    window.location.href = `mailto:${agent.email || defaultAgent.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  }

  return (
    <div className="grid gap-5">
      {showSetupNotice ? (
        <div className="rounded-3xl border border-gold/20 bg-gold-soft px-5 py-4 text-sm text-gold">
          Profile not configured. Set `AGENT_NAME`, `AGENT_PHOTO_URL`, `AGENT_BROKERAGE`, `AGENT_PHONE`, `AGENT_EMAIL`,
          `AGENT_BIO`, `AGENT_ZILLOW_URL`, and `AGENT_LICENSE` to populate this page.
        </div>
      ) : null}

      {loadError ? <div className="rounded-3xl border border-red/20 bg-red-soft px-5 py-4 text-sm text-red">{loadError}</div> : null}

      <section className="surface-panel p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          {agent.photo ? (
            <img src={agent.photo} alt={agent.name} className="h-28 w-28 rounded-full border-4 border-line object-cover" />
          ) : (
            <div className="grid h-28 w-28 place-items-center rounded-full border-4 border-line bg-green-soft text-3xl font-semibold text-green">
              {initials(agent.name)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="text-4xl font-semibold tracking-tight">{agent.name}</h1>
            <p className="mt-2 text-base text-muted">{agent.brokerage}</p>
            {agent.licenseNumber ? <p className="mt-1 text-sm text-muted">License #{agent.licenseNumber}</p> : null}
            <p className="mt-4 max-w-2xl text-base leading-7 text-ink">
              Investor-friendly agent serving Chicagoland. Buying, selling, investing, and leasing with a data-driven edge.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              {agent.zillowUrl ? (
                <a
                  href={agent.zillowUrl}
                  target="_blank"
                  rel="noopener"
                  className="rounded-full border border-green bg-green-soft px-4 py-2 text-sm font-semibold text-green"
                >
                  View on Zillow
                </a>
              ) : null}
              {agent.phone ? (
                <a href={`tel:${agent.phone}`} className="rounded-full border border-line bg-page px-4 py-2 text-sm font-semibold text-ink">
                  {agent.phone}
                </a>
              ) : null}
              {agent.email ? (
                <a href={`mailto:${agent.email}`} className="rounded-full border border-line bg-page px-4 py-2 text-sm font-semibold text-ink">
                  {agent.email}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-4">
        {[
          ['4.8 ★', 'Zillow rating · 20 reviews'],
          ['41', 'Total sales'],
          ['7', 'Sales last 12 months'],
          ['$445K', 'Average closing price'],
        ].map(([value, label]) => (
          <div key={label} className="surface-panel p-5">
            <div className="text-3xl font-semibold tracking-tight">{value}</div>
            <div className="mt-2 text-sm text-muted">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr),360px] xl:items-start">
        <section className="surface-panel p-8">
          <p className="section-kicker">About</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Not your typical agent</h2>
          <p className="mt-4 text-lg font-medium leading-8 text-ink">
            Seasoned investor, expert negotiator, and a marketing-driven operator who understands the math behind a real estate decision.
          </p>
          <p className="mt-4 text-base leading-8 text-muted">{agent.bio}</p>

          <div className="mt-8 grid gap-3">
            {[
              [
                'Investor-first approach',
                'Runs the numbers first and evaluates property decisions through cash flow, cap rate, and upside potential.',
              ],
              [
                'Marketing-driven pricing',
                'Uses positioning, pricing, and buyer targeting to maximize sale outcomes, not just list and wait.',
              ],
              [
                'Full-service across goals',
                'Buying, selling, investing, leasing, and house hacking from one advisor.',
              ],
              [
                'Deep Chicagoland roots',
                'Hands-on experience across Chicago and the surrounding suburbs.',
              ],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-line/70 bg-page/70 p-4">
                <p className="font-semibold text-ink">{title}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="surface-panel p-6 xl:sticky xl:top-28">
          <h2 className="text-2xl font-semibold tracking-tight">Get in touch</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Free consultation. No pressure. Typical response time is a few hours.</p>

          {sent ? (
            <div className="mt-5 rounded-2xl border border-green/20 bg-green-soft px-4 py-3 text-sm font-medium text-green">
              Message draft opened. Tonya will be in touch once you send the email.
            </div>
          ) : (
            <form className="mt-5 grid gap-4" onSubmit={handleSubmit} noValidate>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="cf-name">
                  Your name
                </label>
                <input
                  id="cf-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="cf-email">
                  Email
                </label>
                <input
                  id="cf-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="cf-phone">
                  Phone
                </label>
                <input
                  id="cf-phone"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="(312) 555-0100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="cf-goal">
                  What are you trying to do?
                </label>
                <select id="cf-goal" value={form.goal} onChange={(event) => setForm((current) => ({ ...current, goal: event.target.value }))}>
                  <option value="">Select one…</option>
                  <option>Buy a rental property</option>
                  <option>House hack</option>
                  <option>Sell a property</option>
                  <option>Analyze an investment</option>
                  <option>Find a tenant / lease</option>
                  <option>Just exploring</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="cf-listing">
                  Listing URL
                </label>
                <input
                  id="cf-listing"
                  type="url"
                  value={form.listing}
                  onChange={(event) => setForm((current) => ({ ...current, listing: event.target.value }))}
                  placeholder="https://redfin.com/…"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="cf-message">
                  Message
                </label>
                <textarea
                  id="cf-message"
                  value={form.message}
                  onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
                  placeholder="Tell Tonya what you're working on…"
                  rows={5}
                />
              </div>
              {formError ? <div className="text-sm text-red">{formError}</div> : null}
              <button
                type="submit"
                className="rounded-full border border-green bg-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              >
                Send message
              </button>
            </form>
          )}
        </aside>
      </div>

      <section className="rounded-3xl border border-green/20 bg-green-soft/70 px-6 py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Run the numbers first</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Use Quick Check for a 30-second read, then share the deal with your agent.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/quick-check"
              className="rounded-full border border-green bg-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
            >
              Quick Check
            </Link>
            <Link
              to="/add"
              className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink hover:border-muted/40"
            >
              Full Analysis
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
