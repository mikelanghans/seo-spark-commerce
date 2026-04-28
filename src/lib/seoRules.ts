// Shared SEO rule definitions. Used by:
//  - The listing generator (to constrain AI output)
//  - The pre-push validator (to flag issues before sending to marketplaces)
//  - The scanner grader (so what we publish matches what we score)
//  - The Fix-Issue UI (to show users the same rules that triggered the issue)
//
// Keep this file in sync with `supabase/functions/_shared/seo-rules.ts`.

export const SEO_RULES = {
  title: { min: 30, max: 60, soft_min: 20, soft_max: 70 },
  metaDescription: { min: 120, max: 160, soft_min: 70, soft_max: 170 },
  urlHandle: { max: 75, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  altText: { min: 8, max: 125 },
  h1: { required: true, maxCount: 1 },
  bodyContent: { minWords: 200 },
  tags: { min: 3, max: 13 },
  canonical: { required: true },
  viewport: { required: true },
  openGraph: { required: true },
} as const;

export type SeoSeverity = "error" | "warning" | "info";

export interface SeoIssue {
  severity: SeoSeverity;
  code: string;
  message: string;
  field?: "seoTitle" | "seoDescription" | "urlHandle" | "altText" | "title" | "description" | "tags" | "h1" | "canonical" | "viewport" | "og" | "content" | "images";
  suggestion?: string;
}

export interface ListingForValidation {
  title?: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  urlHandle?: string;
  altText?: string;
  tags?: string[];
}

/** Validate a Brand Aura listing against the same SEO rules the scanner uses. */
export function validateListing(l: ListingForValidation): SeoIssue[] {
  const issues: SeoIssue[] = [];

  const seoTitle = (l.seoTitle || l.title || "").trim();
  if (!seoTitle) {
    issues.push({ severity: "error", code: "missing_seo_title", message: "Missing SEO title", field: "seoTitle" });
  } else {
    if (seoTitle.length < SEO_RULES.title.min) {
      issues.push({ severity: "warning", code: "short_title", message: `SEO title is short (${seoTitle.length} chars, aim ${SEO_RULES.title.min}–${SEO_RULES.title.max})`, field: "seoTitle" });
    } else if (seoTitle.length > SEO_RULES.title.max) {
      issues.push({ severity: "warning", code: "long_title", message: `SEO title is long (${seoTitle.length} chars, max ${SEO_RULES.title.max})`, field: "seoTitle" });
    }
  }

  const seoDesc = (l.seoDescription || "").trim();
  if (!seoDesc) {
    issues.push({ severity: "warning", code: "missing_meta_desc", message: "Missing meta description", field: "seoDescription" });
  } else {
    if (seoDesc.length < SEO_RULES.metaDescription.min) {
      issues.push({ severity: "info", code: "short_desc", message: `Meta description is short (${seoDesc.length} chars, aim ${SEO_RULES.metaDescription.min}–${SEO_RULES.metaDescription.max})`, field: "seoDescription" });
    } else if (seoDesc.length > SEO_RULES.metaDescription.max) {
      issues.push({ severity: "info", code: "long_desc", message: `Meta description is long (${seoDesc.length} chars, max ${SEO_RULES.metaDescription.max})`, field: "seoDescription" });
    }
  }

  const handle = (l.urlHandle || "").trim();
  if (!handle) {
    issues.push({ severity: "warning", code: "missing_handle", message: "Missing URL handle", field: "urlHandle" });
  } else {
    if (handle.length > SEO_RULES.urlHandle.max) {
      issues.push({ severity: "warning", code: "long_handle", message: `URL handle is long (${handle.length} chars, max ${SEO_RULES.urlHandle.max})`, field: "urlHandle" });
    }
    if (!SEO_RULES.urlHandle.pattern.test(handle)) {
      issues.push({ severity: "warning", code: "invalid_handle", message: "URL handle should be lowercase letters, numbers, and single hyphens", field: "urlHandle" });
    }
  }

  const alt = (l.altText || "").trim();
  if (!alt) {
    issues.push({ severity: "warning", code: "missing_alt", message: "Missing image alt text", field: "altText" });
  } else if (alt.length < SEO_RULES.altText.min) {
    issues.push({ severity: "info", code: "short_alt", message: `Alt text is too brief (${alt.length} chars)`, field: "altText" });
  } else if (alt.length > SEO_RULES.altText.max) {
    issues.push({ severity: "info", code: "long_alt", message: `Alt text is long (${alt.length} chars, max ${SEO_RULES.altText.max})`, field: "altText" });
  }

  const tagCount = Array.isArray(l.tags) ? l.tags.filter((t) => t && t.trim()).length : 0;
  if (tagCount < SEO_RULES.tags.min) {
    issues.push({ severity: "info", code: "few_tags", message: `Only ${tagCount} tags (aim ${SEO_RULES.tags.min}+)`, field: "tags" });
  }

  const desc = (l.description || "").trim();
  const wordCount = desc.split(/\s+/).filter(Boolean).length;
  if (wordCount < SEO_RULES.bodyContent.minWords) {
    issues.push({ severity: "warning", code: "thin_content", message: `Description is thin (${wordCount} words, aim ${SEO_RULES.bodyContent.minWords}+)`, field: "description" });
  }

  return issues;
}

/** Slugify a string into a valid URL handle. */
export function toUrlHandle(input: string, maxLen = SEO_RULES.urlHandle.max): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen)
    .replace(/-+$/g, "");
}

/** Clamp a string to fit within min/max, soft-trimming on whitespace. */
export function clampToRange(text: string, max: number): string {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > max * 0.6) return truncated.slice(0, lastSpace).trimEnd();
  return truncated.trimEnd();
}

/** Counts of how many issues fall into each severity. */
export function summarizeIssues(issues: SeoIssue[]) {
  return issues.reduce(
    (acc, i) => ({ ...acc, [i.severity]: acc[i.severity] + 1 }),
    { error: 0, warning: 0, info: 0 } as Record<SeoSeverity, number>,
  );
}
