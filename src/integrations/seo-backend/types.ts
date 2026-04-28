export type ScanStatus = "pending" | "running" | "complete" | "error";
export type ScanPhase = "queued" | "mapping" | "scanning" | "grading" | "complete" | "error";
export type ScanScope = "quick" | "standard" | "deep";

export interface SavedScan {
  id: string;
  organization_id: string;
  brand_aura_user_id: string;
  root_url: string;
  scope: ScanScope;
  status: ScanStatus;
  phase: ScanPhase;
  pages_scanned: number;
  pages_total: number;
  discovered_url_count: number;
  report: ScanReport | null;
  error_message: string | null;
  retry_scan_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScanIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  field?: string;
}

export interface ProductMatch {
  productId: string;
  listingId: string | null;
  marketplace: string | null;
}

export interface ScanReportPage {
  url: string;
  status: number;
  title: string;
  description: string;
  h1: string[];
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  imagesMissingAlt: number;
  hasCanonical: boolean;
  hasViewport: boolean;
  score: number;
  issues: ScanIssue[];
  productMatch?: ProductMatch | null;
}

export interface ScanReport {
  rootUrl: string;
  scope: ScanScope;
  overallScore: number;
  issueCounts: { error: number; warning: number; info: number };
  summary: string;
  topRecommendations: string[];
  pages: ScanReportPage[];
  generatedAt: string;
}

export const SCAN_SCOPE_LABELS: Record<ScanScope, string> = {
  quick: "Quick (10 pages)",
  standard: "Standard (50 pages)",
  deep: "Deep (200 pages)",
};
