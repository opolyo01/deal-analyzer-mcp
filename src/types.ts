export type JsonRecord = Record<string, any>;

export interface AppUser {
  id: string;
  googleId?: string | null;
  email?: string | null;
  displayName?: string | null;
  stripeCustomerId?: string | null;
  subscriptionStatus?: string | null;
}

export interface DealColumnRow {
  name: string;
}

export interface DealRow {
  id: string;
  userId: string | null;
  label: string;
  input: string;
  analysis: string;
  createdAt: string;
}

export interface OAuthClient {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
  scope: string;
  client_name?: string;
}

export interface OAuthCodeRecord {
  client_id: string;
  redirect_uri: string;
  userId: string;
  scope: string;
  code_challenge: string;
  expiresAt: number;
}

export interface OAuthTokenRecord {
  userId: string;
  client_id: string;
  scope: string;
  expiresAt?: number;
}

declare global {
  namespace Express {
    interface User extends AppUser {}
  }
}

declare module 'express-session' {
  interface SessionData {
    returnTo?: string;
  }
}
