export type JsonMap = Record<string, unknown>;

export interface CurrentUser {
  id: string;
  email?: string | null;
  displayName?: string | null;
  subscriptionStatus?: string | null;
}

export interface AgentConfig {
  name: string;
  photo: string;
  brokerage: string;
  phone: string;
  email: string;
  bio: string;
  zillowUrl: string;
  licenseNumber: string;
}

export interface LocationInfo {
  city?: string;
  state?: string;
  confidence?: string;
}

export interface MarketRentEstimate {
  rent: number;
  low: number;
  high: number;
  estimated: boolean;
  confidence?: string | null;
  method?: string;
  compsUsed?: number;
  location?: LocationInfo;
}

export interface TaxEstimate {
  annual: number;
  monthly: number;
  rate: number;
  state?: string | null;
  confidence?: string;
  method?: string;
}

export interface InsuranceEstimate {
  annual: number;
  monthly: number;
  rate: number;
  stateMultiplier?: number;
  propertyType?: string;
  state?: string | null;
  confidence?: string;
  method?: string;
}

export interface DealFormPayload {
  label?: string;
  address?: string;
  sourceUrl?: string;
  price?: number | null;
  rent?: number | null;
  taxes?: number | null;
  insurance?: number | null;
  hoa?: number | null;
  otherMonthlyCosts?: number | null;
  vacancyRate?: number | null;
  repairsRate?: number | null;
  capexRate?: number | null;
  managementRate?: number | null;
  downPaymentPercent?: number | null;
  rate?: number | null;
  termYears?: number | null;
  propertyType?: string;
}

export interface DealInput extends JsonMap {
  label?: string;
  address?: string;
  sourceUrl?: string;
  location?: LocationInfo;
  price: number;
  rent: number;
  taxes: number;
  insurance: number;
  hoa: number;
  otherMonthlyCosts: number;
  rate: number;
  termYears: number;
  vacancyRate: number;
  repairsRate: number;
  capexRate: number;
  managementRate: number;
  propertyType?: string;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  downPaymentAmount?: number;
  downPaymentPercent?: number;
  rentProvided?: boolean;
  taxesProvided?: boolean;
  insuranceProvided?: boolean;
  hoaProvided?: boolean;
  estimatedRent?: boolean;
  estimatedRentConfidence?: string | null;
  marketRent?: MarketRentEstimate;
  taxesEstimated?: boolean;
  insuranceEstimated?: boolean;
  taxEstimate?: TaxEstimate | null;
  insuranceEstimate?: InsuranceEstimate | null;
}

export interface MonthlyExpenseBreakdown {
  mortgage: number;
  debtPayment?: number;
  interest: number;
  principalPaydown: number;
  taxes: number;
  insurance: number;
  hoa: number;
  otherMonthlyCosts: number;
  vacancy: number;
  repairs: number;
  capex: number;
  management: number;
}

export interface AnalysisSummary {
  monthlyCashFlow: number;
  capRate: number;
  grossYield: number;
  cashOnCashReturn: number;
  dscr: number;
  score: number;
  recommendation: string;
  breakEvenRent: number;
  monthlyMortgage: number;
  monthlyInterest: number;
  monthlyPrincipalPaydown: number;
  monthlyOperatingExpense: number;
  monthlyAllInCost: number;
  monthlyCostBeforePrincipal: number;
  monthlyCashFlowBeforePrincipal: number;
  monthlyExpenseBreakdown: MonthlyExpenseBreakdown;
  missingInputs: {
    taxes: boolean;
    insurance: boolean;
    hoa: boolean;
  };
  estimatedInputs: {
    rent: boolean;
    taxes: boolean;
    insurance: boolean;
  };
  marketRent?: MarketRentEstimate;
  estimatedRent?: boolean;
  estimatedRentConfidence?: string | null;
}

export interface DealAssumptions {
  rate: number;
  termYears: number;
  downPaymentAmount: number;
  downPaymentPercent: number;
  vacancyRate: number;
  repairsRate: number;
  capexRate: number;
  managementRate: number;
  location?: LocationInfo;
  taxEstimate?: TaxEstimate | null;
  insuranceEstimate?: InsuranceEstimate | null;
}

export interface DealAnalysis {
  input: DealInput;
  summary: AnalysisSummary;
  assumptions: DealAssumptions;
  strengths: string[];
  risks: string[];
}

export interface SavedDeal {
  id: string;
  userId?: string | null;
  label?: string;
  createdAt: string;
  input: JsonMap;
  analysis: DealAnalysis;
}

export interface SaveDealResponse {
  id: string;
  analysis: DealAnalysis;
  user: CurrentUser | null;
}

export interface ParseListingResult extends JsonMap {
  sourceUrl?: string;
  address?: string;
  propertyType?: string;
  price?: number | null;
  rent?: number | null;
  taxes?: number | null;
  insurance?: number | null;
  hoa?: number | null;
  photoUrl?: string | null;
  fetchFailed?: boolean;
  fetchError?: string;
  parserNotes?: string[];
}

export interface ApiError extends Error {
  status?: number;
  data?: JsonMap | null;
}
