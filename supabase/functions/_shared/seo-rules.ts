// Mirror of src/lib/seoRules.ts for edge function runtime.
// Keep thresholds identical between this file and the frontend module.

export const SEO_RULES = {
  title: { min: 30, max: 60, soft_min: 20, soft_max: 70 },
  metaDescription: { min: 120, max: 160, soft_min: 70, soft_max: 170 },
  urlHandle: { max: 75, pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
  altText: { min: 8, max: 125 },
  bodyContent: { minWords: 200 },
  tags: { min: 3, max: 13 },
};

export type SeoSeverity = "error" | "warning" | "info";
export type SeoCategory = "onPage" | "structuredData" | "aeo" | "performance";

export interface SeoIssue {
  severity: SeoSeverity;
  code: string;
  message: string;
  category?: SeoCategory;
  field?: string;
}

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

export function clampToRange(text: string, max: number): string {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > max * 0.6) return truncated.slice(0, lastSpace).trimEnd();
  return truncated.trimEnd();
}

/** Normalize an AI-generated listing so it satisfies SEO_RULES wherever possible. */
export function normalizeListing(listing: any, fallbackTitle = "Untitled product"): any {
  if (!listing || typeof listing !== "object") return listing;

  const title = String(listing.title || fallbackTitle).trim();
  let seoTitle = String(listing.seoTitle || title).trim();
  if (seoTitle.length > SEO_RULES.title.max) seoTitle = clampToRange(seoTitle, SEO_RULES.title.max);

  let seoDescription = String(listing.seoDescription || "").trim();
  if (seoDescription.length > SEO_RULES.metaDescription.max) {
    seoDescription = clampToRange(seoDescription, SEO_RULES.metaDescription.max);
  }

  let urlHandle = String(listing.urlHandle || "").trim();
  if (!urlHandle || !SEO_RULES.urlHandle.pattern.test(urlHandle) || urlHandle.length > SEO_RULES.urlHandle.max) {
    urlHandle = toUrlHandle(urlHandle || title);
  }

  let altText = String(listing.altText || "").trim();
  if (altText.length > SEO_RULES.altText.max) altText = clampToRange(altText, SEO_RULES.altText.max);

  return { ...listing, title, seoTitle, seoDescription, urlHandle, altText };
}
