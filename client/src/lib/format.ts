export function currency(value: number | null | undefined) {
  const amount = Number(value || 0);
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;
}

export function percent(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return '-';
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

export function number(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return '-';
  return Number(value).toFixed(digits);
}

export function compactNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
