import type {
  ApiError,
  AgentConfig,
  CurrentUser,
  DealAnalysis,
  DealFormPayload,
  JsonMap,
  ParseListingResult,
  SaveDealResponse,
  SavedDeal,
} from './types';

function responseMessage(body: unknown, status: number) {
  if (body && typeof body === 'object') {
    const payload = body as JsonMap;
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.error === 'string') return payload.error;
  }

  return `Request failed (${status}).`;
}

async function request<T>(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, {
    credentials: 'same-origin',
    ...init,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const error = new Error(responseMessage(body, response.status)) as ApiError;
    error.status = response.status;
    error.data = body && typeof body === 'object' ? (body as JsonMap) : null;
    throw error;
  }

  return body as T;
}

export function getCurrentUser() {
  return request<CurrentUser | null>('/whoami');
}

export function getAgentConfig() {
  return request<AgentConfig>('/agent-config');
}

export function getDeals() {
  return request<SavedDeal[]>('/deals');
}

export function analyzeDeal(payload: DealFormPayload) {
  return request<DealAnalysis>('/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function saveDeal(payload: DealFormPayload) {
  return request<SaveDealResponse>('/saveDeal', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function parseListing(url: string) {
  return request<ParseListingResult>('/parse-listing', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function deleteDeal(id: string) {
  return request<{ deleted: string }>(`/deals/${id}`, {
    method: 'DELETE',
  });
}
