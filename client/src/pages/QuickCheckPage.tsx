import { type FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { analyzeDeal } from '../lib/api';
import { currency, errorMessage, percent } from '../lib/format';
import type { DealAnalysis, DealFormPayload } from '../lib/types';
import { MetricCard } from '../components/ui/MetricCard';
import { ScoreBadge } from '../components/ui/ScoreBadge';

interface QuickCheckFormState {
  price: string;
  rent: string;
  taxes: string;
  insurance: string;
}

const initialState: QuickCheckFormState = {
  price: '',
  rent: '',
  taxes: '',
  insurance: '',
};

function parseNumber(value: string) {
  const cleaned = value.trim().replace(/[$,%\s,]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPayload(state: QuickCheckFormState): DealFormPayload {
  return Object.fromEntries(
    Object.entries({
      price: parseNumber(state.price),
      rent: parseNumber(state.rent),
      taxes: parseNumber(state.taxes),
      insurance: parseNumber(state.insurance),
    }).filter(([, value]) => value != null),
  ) as DealFormPayload;
}

export function QuickCheckPage() {
  const [form, setForm] = useState(initialState);
  const [status, setStatus] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DealAnalysis | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = (event.data as { structuredContent?: unknown } | null)?.structuredContent;
      if (data && typeof data === 'object' && 'summary' in (data as Record<string, unknown>)) {
        setAnalysis(data as DealAnalysis);
        setStatus('Analysis ready.');
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildPayload(form);

    if (!payload.price) {
      setStatus('Purchase price is required.');
      return;
    }

    setIsSubmitting(true);
    setStatus('Analyzing...');

    try {
      const result = await analyzeDeal(payload);
      setAnalysis(result);
      setStatus('Analysis ready.');
    } catch (caughtError) {
      setStatus(errorMessage(caughtError, 'Something went wrong.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <section className="surface-panel p-6 md:p-8">
        <h1 className="text-4xl font-semibold tracking-tight">Quick Check</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
          A fast first pass. Enter price and rent for an instant score, then move to the full analysis when the deal looks interesting.
        </p>

        <form className="mt-8 grid gap-6" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['price', 'Purchase price', '350000'],
              ['rent', 'Monthly rent', '2850'],
              ['taxes', 'Annual taxes', '5200'],
              ['insurance', 'Annual insurance', '1800'],
            ].map(([field, label, placeholder]) => (
              <div key={field}>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor={field}>
                  {label}
                </label>
                <input
                  id={field}
                  value={form[field as keyof QuickCheckFormState]}
                  onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                  inputMode="decimal"
                  placeholder={placeholder}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary"
            >
              {isSubmitting ? 'Analyzing...' : 'Analyze'}
            </button>
            <Link
              to="/add"
              className="btn-secondary"
            >
              Full Analysis
            </Link>
            <Link
              to="/dashboard"
              className="btn-secondary"
            >
              Saved Deals
            </Link>
          </div>

          {status ? <div className="rounded-2xl border border-line/70 bg-page/70 px-4 py-3 text-sm text-muted">{status}</div> : null}
        </form>

        <div className="mt-8">
          {analysis ? (
            <div className="grid gap-5">
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-line/60 bg-surface/50 p-5">
                <div>
                  <p className="section-kicker">Quick result</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Instant underwriting snapshot</h2>
                </div>
                <ScoreBadge recommendation={analysis.summary.recommendation} score={analysis.summary.score} />
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <MetricCard
                  label="After debt"
                  value={currency(analysis.summary.monthlyCashFlow)}
                  tone={analysis.summary.monthlyCashFlow >= 0 ? 'positive' : 'negative'}
                />
                <MetricCard
                  label="Before principal"
                  value={currency(analysis.summary.monthlyCashFlowBeforePrincipal)}
                  tone={analysis.summary.monthlyCashFlowBeforePrincipal >= 0 ? 'accent' : 'negative'}
                />
                <MetricCard label="Principal paydown" value={currency(analysis.summary.monthlyPrincipalPaydown)} />
                <MetricCard label="Cap rate" value={percent(analysis.summary.capRate)} />
                <MetricCard label="Break-even rent" value={currency(analysis.summary.breakEvenRent)} />
                <MetricCard label="Rent used" value={currency(analysis.input.rent)} />
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/add"
                  className="btn-primary"
                >
                  Full Analysis
                </Link>
                <Link
                  to="/dashboard"
                  className="btn-secondary"
                >
                  Save this deal
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line/50 bg-surface/30 p-10 text-center">
              <h2 className="text-2xl font-semibold tracking-tight">No result yet</h2>
              <p className="mt-3 text-sm leading-6 text-muted">Enter a purchase price to calculate a fast investment score.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
