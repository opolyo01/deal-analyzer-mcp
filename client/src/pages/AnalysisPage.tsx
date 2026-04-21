import type { ChangeEvent } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { analyzeDeal, getDeal, parseListing, saveDeal } from '../lib/api';
import { errorMessage } from '../lib/format';
import type { ApiError, CurrentUser, DealFormPayload, ParseListingResult, SavedDeal } from '../lib/types';
import { AnalysisResultPanel } from '../components/AnalysisResultPanel';

const propertyOptions = ['Single family', 'Duplex', 'Triplex', 'Multifamily', 'Condo', 'Townhouse'];

interface AnalysisFormState {
  label: string;
  address: string;
  price: string;
  rent: string;
  taxes: string;
  insurance: string;
  hoa: string;
  propertyType: string;
  otherMonthlyCosts: string;
  downPaymentPercent: string;
  rate: string;
  termYears: string;
  vacancyRate: string;
  repairsRate: string;
  capexRate: string;
  managementRate: string;
}

type BannerTone = 'positive' | 'negative' | 'warning' | 'neutral';

interface BannerState {
  tone: BannerTone;
  message: string;
}

interface AnalysisPageProps {
  user: CurrentUser | null;
}

const defaultFormState: AnalysisFormState = {
  label: '',
  address: '',
  price: '',
  rent: '',
  taxes: '',
  insurance: '',
  hoa: '',
  propertyType: '',
  otherMonthlyCosts: '',
  downPaymentPercent: '20',
  rate: '6.5',
  termYears: '30',
  vacancyRate: '5',
  repairsRate: '5',
  capexRate: '5',
  managementRate: '8',
};

function bannerClasses(tone: BannerTone) {
  if (tone === 'positive') return 'border-green/20 bg-green-soft text-green';
  if (tone === 'negative') return 'border-red/20 bg-red-soft text-red';
  if (tone === 'warning') return 'border-gold/20 bg-gold-soft text-gold';
  return 'border-line/70 bg-page/70 text-muted';
}

function parseNumber(value: string) {
  const cleaned = value.trim().replace(/[$,%\s,]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripEmpty(payload: DealFormPayload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== '' && value != null),
  ) as DealFormPayload;
}

function buildPayload(form: AnalysisFormState, listingUrl: string): DealFormPayload {
  const downPaymentPercent = parseNumber(form.downPaymentPercent);
  const rate = parseNumber(form.rate);
  const vacancyRate = parseNumber(form.vacancyRate);
  const repairsRate = parseNumber(form.repairsRate);
  const capexRate = parseNumber(form.capexRate);
  const managementRate = parseNumber(form.managementRate);

  return stripEmpty({
    label: form.label.trim(),
    address: form.address.trim(),
    sourceUrl: listingUrl.trim() || undefined,
    price: parseNumber(form.price),
    rent: parseNumber(form.rent),
    taxes: parseNumber(form.taxes),
    insurance: parseNumber(form.insurance),
    hoa: parseNumber(form.hoa),
    otherMonthlyCosts: parseNumber(form.otherMonthlyCosts),
    downPaymentPercent: downPaymentPercent == null ? null : downPaymentPercent / 100,
    rate: rate == null ? null : rate / 100,
    termYears: parseNumber(form.termYears),
    vacancyRate: vacancyRate == null ? null : vacancyRate / 100,
    repairsRate: repairsRate == null ? null : repairsRate / 100,
    capexRate: capexRate == null ? null : capexRate / 100,
    managementRate: managementRate == null ? null : managementRate / 100,
    propertyType: form.propertyType,
  });
}

function matchPropertyType(value: string | undefined) {
  if (!value) return '';
  const match = propertyOptions.find((option) => option.toLowerCase().includes(value.toLowerCase()));
  return match || value;
}

function toInputString(value: unknown) {
  if (value == null || value === '') return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return String(Number(parsed.toFixed(2)));
}

function toPercentInputString(value: unknown) {
  if (value == null || value === '') return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return String(Number((parsed * 100).toFixed(2)));
}

function buildFormStateFromSavedDeal(deal: SavedDeal): AnalysisFormState {
  const input = deal.analysis.input;
  const assumptions = deal.analysis.assumptions;

  return {
    label: input.label || deal.label || '',
    address: input.address || '',
    price: toInputString(input.price),
    rent: toInputString(input.rent),
    taxes: toInputString(input.taxes),
    insurance: toInputString(input.insurance),
    hoa: toInputString(input.hoa),
    propertyType: input.propertyType || '',
    otherMonthlyCosts: toInputString(input.otherMonthlyCosts),
    downPaymentPercent: toPercentInputString(assumptions.downPaymentPercent ?? input.downPaymentPercent),
    rate: toPercentInputString(assumptions.rate ?? input.rate),
    termYears: toInputString(assumptions.termYears ?? input.termYears),
    vacancyRate: toPercentInputString(assumptions.vacancyRate ?? input.vacancyRate),
    repairsRate: toPercentInputString(assumptions.repairsRate ?? input.repairsRate),
    capexRate: toPercentInputString(assumptions.capexRate ?? input.capexRate),
    managementRate: toPercentInputString(assumptions.managementRate ?? input.managementRate),
  };
}

export function AnalysisPage({ user }: AnalysisPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState<AnalysisFormState>(defaultFormState);
  const [listingUrl, setListingUrl] = useState('');
  const [importBanner, setImportBanner] = useState<BannerState | null>(null);
  const [statusBanner, setStatusBanner] = useState<BannerState | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof analyzeDeal>> | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [parserNotes, setParserNotes] = useState<string[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingSavedDeal, setIsLoadingSavedDeal] = useState(false);
  const savedDealId = searchParams.get('deal');

  useEffect(() => {
    if (!savedDealId) {
      setForm(defaultFormState);
      setListingUrl('');
      setImportBanner(null);
      setStatusBanner(null);
      setResult(null);
      setPhotoUrl(null);
      setParserNotes([]);
      setSavedId(null);
      setIsDirty(false);
      return;
    }

    let cancelled = false;
    setIsLoadingSavedDeal(true);
    setStatusBanner({ tone: 'neutral', message: 'Loading saved analysis...' });

    void (async () => {
      try {
        const savedDeal = await getDeal(savedDealId);
        if (cancelled) return;

        setForm(buildFormStateFromSavedDeal(savedDeal));
        setListingUrl(savedDeal.analysis.input.sourceUrl || '');
        setImportBanner(null);
        setResult(savedDeal.analysis);
        setPhotoUrl(typeof savedDeal.input.photoUrl === 'string' ? savedDeal.input.photoUrl : null);
        setParserNotes([]);
        setSavedId(savedDeal.id);
        setIsDirty(false);
        setStatusBanner({ tone: 'positive', message: 'Saved analysis loaded. Adjust assumptions and save again to update it.' });
      } catch (caughtError) {
        if (!cancelled) {
          setStatusBanner({ tone: 'negative', message: errorMessage(caughtError, 'Failed to load saved deal.') });
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSavedDeal(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [savedDealId]);

  function updateField(field: keyof AnalysisFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (result) setIsDirty(true);
  }

  function handleFieldChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const field = event.target.name as keyof AnalysisFormState;
    updateField(field, event.target.value);
  }

  function applyListingData(parsed: ParseListingResult) {
    setForm((current) => ({
      ...current,
      label: parsed.address || current.label,
      address: parsed.address || '',
      price: parsed.price != null ? String(parsed.price) : '',
      rent: parsed.rent != null ? String(parsed.rent) : '',
      taxes: parsed.taxes != null ? String(parsed.taxes) : '',
      insurance: parsed.insurance != null ? String(parsed.insurance) : '',
      hoa: parsed.hoa != null ? String(parsed.hoa) : '',
      propertyType: matchPropertyType(typeof parsed.propertyType === 'string' ? parsed.propertyType : current.propertyType),
    }));
  }

  async function handleImport() {
    const url = listingUrl.trim();

    if (!url) {
      setImportBanner({ tone: 'warning', message: 'Paste a Zillow or Redfin URL first.' });
      return;
    }

    setIsImporting(true);
    setImportBanner({ tone: 'neutral', message: 'Fetching listing details...' });

    try {
      const parsed = await parseListing(url);
      applyListingData(parsed);
      setPhotoUrl(typeof parsed.photoUrl === 'string' ? parsed.photoUrl : null);
      setParserNotes(Array.isArray(parsed.parserNotes) ? parsed.parserNotes.filter((note): note is string => typeof note === 'string') : []);
      setIsDirty(Boolean(result));

      if (parsed.fetchFailed) {
        setImportBanner({
          tone: 'warning',
          message: parsed.fetchError || 'Could not fetch the listing page. Review the prefilled address and enter pricing manually.',
        });
      } else {
        setImportBanner({ tone: 'positive', message: 'Form filled. Review the numbers and run the analysis.' });
      }
    } catch (caughtError) {
      setImportBanner({ tone: 'negative', message: errorMessage(caughtError, 'Could not parse that listing URL.') });
    } finally {
      setIsImporting(false);
    }
  }

  async function handleSubmit(mode: 'analyze' | 'save') {
    const payload = buildPayload(form, listingUrl);

    if (!payload.price) {
      setStatusBanner({ tone: 'negative', message: 'Purchase price is required before you can analyze a deal.' });
      return;
    }

    setIsSubmitting(true);
    setStatusBanner({
      tone: 'neutral',
      message: mode === 'save' ? 'Analyzing and saving the deal...' : 'Running the deal analysis...',
    });

    try {
      if (mode === 'save') {
        const saved = await saveDeal(payload);
        setResult(saved.analysis);
        setSavedId(saved.id);
        setSearchParams({ deal: saved.id }, { replace: true });
        setStatusBanner({ tone: 'positive', message: 'Deal analyzed and saved to the dashboard.' });
      } else {
        const analysis = await analyzeDeal(payload);
        setResult(analysis);
        setSavedId(null);
        setStatusBanner({ tone: 'positive', message: 'Analysis ready.' });
      }

      setIsDirty(false);
    } catch (caughtError) {
      const apiError = caughtError as ApiError;
      if (apiError.status === 401 && typeof apiError.data?.loginUrl === 'string') {
        window.location.href = apiError.data.loginUrl;
        return;
      }

      if (apiError.status === 402 && typeof apiError.data?.upgradeUrl === 'string') {
        window.location.href = apiError.data.upgradeUrl;
        return;
      }

      setStatusBanner({ tone: 'negative', message: errorMessage(caughtError, 'Failed to analyze the deal.') });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.92fr),minmax(380px,0.78fr)] 2xl:items-start">
      <div className="min-w-0 grid gap-5">
        <section className="surface-panel p-6">
          <div className="grid gap-6">
            <div className="min-w-0 max-w-2xl">
              <p className="section-kicker">Import listing</p>
              <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Import a listing URL to prefill the form.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
                Paste a Zillow or Redfin link to prefill the address, price, taxes, HOA, and photo. You can still override every
                field below before saving.
              </p>
            </div>

            <div className="max-w-3xl">
              <label className="text-xs font-semibold uppercase tracking-[0.16em] text-muted" htmlFor="listing-url">
                Listing URL
              </label>
              <div className="mt-2 flex flex-col gap-3 md:flex-row">
                <div className="min-w-0 flex-1">
                  <input
                    id="listing-url"
                    type="url"
                    value={listingUrl}
                    onChange={(event) => {
                      setListingUrl(event.target.value);
                      if (result) setIsDirty(true);
                    }}
                    placeholder="https://www.redfin.com/..."
                    className="min-w-0"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={isImporting || isLoadingSavedDeal}
                  className="rounded-full border border-blue bg-blue px-6 py-3 text-sm font-semibold text-white hover:brightness-95 md:min-w-[140px]"
                >
                  {isImporting ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
          </div>

          {importBanner ? (
            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-medium ${bannerClasses(importBanner.tone)}`}>
              {importBanner.message}
            </div>
          ) : null}
        </section>

        <section className="surface-panel p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="section-kicker">Deal inputs</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Core underwriting fields</h2>
            </div>
            <div className="inline-flex rounded-full border border-line bg-page px-4 py-2 text-sm text-muted">
              {user ? `Saving as ${user.displayName || user.email || 'your account'}` : 'Save will redirect you to sign in if required.'}
            </div>
          </div>

          <form
            className="mt-6 grid gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit('save');
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="label">
                  Deal label
                </label>
                <input id="label" name="label" value={form.label} onChange={handleFieldChange} placeholder="Oak Avenue rental" />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="address">
                  Address
                </label>
                <input id="address" name="address" value={form.address} onChange={handleFieldChange} placeholder="123 Oak Ave, Raleigh, NC" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="price">
                  Purchase price
                </label>
                <input id="price" name="price" value={form.price} onChange={handleFieldChange} inputMode="decimal" placeholder="425000" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="rent">
                  Monthly rent
                </label>
                <input id="rent" name="rent" value={form.rent} onChange={handleFieldChange} inputMode="decimal" placeholder="3200" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="taxes">
                  Annual taxes
                </label>
                <input id="taxes" name="taxes" value={form.taxes} onChange={handleFieldChange} inputMode="decimal" placeholder="6100" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="insurance">
                  Annual insurance
                </label>
                <input
                  id="insurance"
                  name="insurance"
                  value={form.insurance}
                  onChange={handleFieldChange}
                  inputMode="decimal"
                  placeholder="2100"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="hoa">
                  Monthly HOA
                </label>
                <input id="hoa" name="hoa" value={form.hoa} onChange={handleFieldChange} inputMode="decimal" placeholder="0" />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-muted" htmlFor="propertyType">
                  Property type
                </label>
                <select id="propertyType" name="propertyType" value={form.propertyType} onChange={handleFieldChange}>
                  <option value="">Select type</option>
                  {propertyOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <details className="rounded-3xl border border-line/70 bg-page/70 px-5 py-4">
              <summary className="cursor-pointer text-sm font-semibold text-blue">Advanced assumptions</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-muted" htmlFor="otherMonthlyCosts">
                    Other monthly costs
                  </label>
                  <input
                    id="otherMonthlyCosts"
                    name="otherMonthlyCosts"
                    value={form.otherMonthlyCosts}
                    onChange={handleFieldChange}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-muted" htmlFor="downPaymentPercent">
                    Down payment %
                  </label>
                  <input
                    id="downPaymentPercent"
                    name="downPaymentPercent"
                    value={form.downPaymentPercent}
                    onChange={handleFieldChange}
                    inputMode="decimal"
                    placeholder="20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-muted" htmlFor="rate">
                    Interest rate %
                  </label>
                  <input id="rate" name="rate" value={form.rate} onChange={handleFieldChange} inputMode="decimal" placeholder="6.5" />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-muted" htmlFor="termYears">
                    Loan term (years)
                  </label>
                  <input
                    id="termYears"
                    name="termYears"
                    value={form.termYears}
                    onChange={handleFieldChange}
                    inputMode="numeric"
                    placeholder="30"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-muted" htmlFor="vacancyRate">
                    Vacancy reserve %
                  </label>
                  <input
                    id="vacancyRate"
                    name="vacancyRate"
                    value={form.vacancyRate}
                    onChange={handleFieldChange}
                    inputMode="decimal"
                    placeholder="5"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-muted" htmlFor="repairsRate">
                    Repairs reserve %
                  </label>
                  <input
                    id="repairsRate"
                    name="repairsRate"
                    value={form.repairsRate}
                    onChange={handleFieldChange}
                    inputMode="decimal"
                    placeholder="5"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-muted" htmlFor="capexRate">
                    Capex reserve %
                  </label>
                  <input
                    id="capexRate"
                    name="capexRate"
                    value={form.capexRate}
                    onChange={handleFieldChange}
                    inputMode="decimal"
                    placeholder="5"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-muted" htmlFor="managementRate">
                    Management %
                  </label>
                  <input
                    id="managementRate"
                    name="managementRate"
                    value={form.managementRate}
                    onChange={handleFieldChange}
                    inputMode="decimal"
                    placeholder="8"
                  />
                </div>
              </div>
            </details>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSubmitting || isLoadingSavedDeal}
                className="rounded-full border border-green bg-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              >
                {isSubmitting ? 'Working...' : 'Analyze and save'}
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit('analyze')}
                disabled={isSubmitting || isLoadingSavedDeal}
                className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink hover:border-muted/40"
              >
                Analyze only
              </button>
              <a
                href="/dashboard"
                className="rounded-full border border-line bg-white px-5 py-3 text-sm font-semibold text-ink hover:border-muted/40"
              >
                Saved deals
              </a>
            </div>
          </form>

          {statusBanner ? (
            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-medium ${bannerClasses(statusBanner.tone)}`}>
              {statusBanner.message}
            </div>
          ) : null}
        </section>
      </div>

      <div className="min-w-0 2xl:sticky 2xl:top-28">
        <AnalysisResultPanel
          analysis={result}
          photoUrl={photoUrl}
          parserNotes={parserNotes}
          savedId={savedId}
          isStale={isDirty}
        />
      </div>
    </div>
  );
}
