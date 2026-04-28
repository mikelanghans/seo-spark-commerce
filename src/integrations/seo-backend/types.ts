export type ScanStatus = "pending" | "running" | "complete" | "error";
export type ScanPhase = "queued" | "mapping" | "scanning" | "grading" | "complete" | "error";
export type ScanScope = "quick" | "standard" | "deep";
export type ScanCategory = "onPage" | "structuredData" | "aeo" | "performance";

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
  category?: ScanCategory;
  field?: string;
}

export interface ProductMatch {
  productId: string;
  listingId: string | null;
  marketplace: string | null;
}

export interface PageCategoryScores {
  onPage: number;
  structuredData: number;
  aeo: number;
  overall: number;
}

export interface ScanReportPage {
  url: string;
  status: number;
  title: string;
  description: string;
  h1: string[];
  headingCounts?: { h1: number; h2: number; h3: number; h4: number };
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  imagesTotal?: number;
  imagesMissingAlt: number;
  hasCanonical: boolean;
  hasViewport: boolean;
  hasHtmlLang?: boolean;
  jsonLdTypes?: string[];
  score: number;
  scores?: PageCategoryScores;
  issues: ScanIssue[];
  productMatch?: ProductMatch | null;
}

export interface GroupedIssue {
  code: string;
  severity: "error" | "warning" | "info";
  category: ScanCategory;
  message: string;
  pages: { url: string; title: string }[];
}

export interface CategoryScores {
  onPage: number;
  structuredData: number;
  aeo: number;
  performance: number;
}

export interface ScanReport {
  rootUrl: string;
  scope: ScanScope;
  overallScore: number;
  categoryScores?: CategoryScores;
  issueCounts: { error: number; warning: number; info: number };
  summary: string;
  topRecommendations: string[];
  groupedIssues?: GroupedIssue[];
  pages: ScanReportPage[];
  generatedAt: string;
}

export const SCAN_SCOPE_LABELS: Record<ScanScope, string> = {
  quick: "Quick (10 pages)",
  standard: "Standard (50 pages)",
  deep: "Deep (200 pages)",
};

export const CATEGORY_LABELS: Record<ScanCategory, string> = {
  onPage: "On-Page SEO",
  structuredData: "Structured Data",
  aeo: "AEO (Answer Engine)",
  performance: "Page Speed",
};
