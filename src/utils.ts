import { type Request } from 'express';
import crypto from 'node:crypto';

export const APP_NAME = 'deal-analyzer-mcp';
export const APP_VERSION = '1.9.0';

export function normalizeBaseUrl(value: string | undefined) {
  return value ? value.replace(/\/+$/, '') : '';
}

export function configuredSecret(value: string | undefined) {
  if (!value) return false;
  return !['replace-with-', 'paste-your-', 'your-real-', 'your-client-', 'your-secret'].some(p => value.startsWith(p));
}

export const PUBLIC_BASE_URL = normalizeBaseUrl(process.env.PUBLIC_BASE_URL);
export const isLocalOrigin = !PUBLIC_BASE_URL || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(PUBLIC_BASE_URL);
export const ALLOW_ANONYMOUS_MODE = process.env.ALLOW_ANONYMOUS_MODE === 'true' && isLocalOrigin;

export function baseUrl(req: Request) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  return `${req.protocol}://${req.get('host')}`;
}

export function queryParam(value: unknown): string {
  if (Array.isArray(value)) return queryParam(value[0]);
  return typeof value === 'string' ? value : '';
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function sha256base64url(input: string) {
  return crypto.createHash('sha256').update(input).digest('base64url');
}

export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}
