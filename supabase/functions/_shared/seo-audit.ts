// Shared SEO audit pipeline: Firecrawl map → scrape → Lovable AI grade.
// Designed to run inside an EdgeRuntime.waitUntil background task.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SEO_RULES } from "./seo-rules.ts";

export const SCOPE_LIMITS: Record<string, { pages: number; maxDepth: number }> = {
  quick: { pages: 10, maxDepth: 2 },
  standard: { pages: 50, maxDepth: 3 },
  deep: { pages: 200, maxDepth: 5 },
};

// How many additional pages each "Scan more" run will add (cap)
export const EXTEND_BATCH_SIZE = 25;
// Hard ceiling so a scan can't grow forever
export const EXTEND_MAX_TOTAL = 500;

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

type IssueSeverity = "error" | "warning" | "info";
type IssueCategory = "onPage" | "structuredData" | "aeo" | "performance";

type GradedIssue = {
  severity: IssueSeverity;
  code: string;
  message: string;
  category: IssueCategory;
  field?: string;
};

type ScanRow = {
  id: string;
  root_url: string;
  scope: keyof typeof SCOPE_LIMITS;
  organization_id: string;
};

async function patchScan(adminClient: any, id: string, patch: Record<string, unknown>) {
  await adminClient.from("seo_scans").update(patch).eq("id", id);
}

async function firecrawlMap(rootUrl: string, limit: number, apiKey: string): Promise<string[]> {
  const res = await fetch(`${FIRECRAWL_V2}/map`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: rootUrl, limit, includeSubdomains: false }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Firecrawl map failed [${res.status}]: ${JSON.stringify(data)}`);
  const rawLinks: any[] = data.links || data.data?.links || [];
  // Firecrawl v2 returns links as objects ({url, title, description}); v1 returned strings.
  const links: string[] = rawLinks
    .map((l) => (typeof l === "string" ? l : l?.url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  // Always include rootUrl first
  const set = new Set<string>([rootUrl, ...links]);
  return Array.from(set).slice(0, limit);
}

type ScrapedPage = {
  url: string;
  status: number;
  title: string;
  description: string;
  h1: string[];
  headingCounts: { h1: number; h2: number; h3: number; h4: number };
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  imagesTotal: number;
  imagesMissingAlt: number;
  hasCanonical: boolean;
  hasViewport: boolean;
  hasHtmlLang: boolean;
  ogTitle: string;
  ogDescription: string;
  jsonLdTypes: string[]; // e.g. ["Product", "BreadcrumbList"]
  faqCount: number;
  markdownPreview: string;
  error?: string;
};

async function firecrawlScrape(url: string, apiKey: string): Promise<ScrapedPage> {
  try {
    const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html", "links"],
        onlyMainContent: false,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return emptyPage(url, `Firecrawl scrape ${res.status}`);
    }
    const payload = data.data || data;
    const html: string = payload.html || payload.rawHtml || "";
    const markdown: string = payload.markdown || "";
    const links: string[] = payload.links || [];
    const meta = payload.metadata || {};
    const status: number = Number(meta.statusCode) || 200;

    const host = safeHost(url);
    let internal = 0, external = 0;
    for (const l of links) {
      const h = safeHost(l);
      if (!h) continue;
      if (h === host) internal++;
      else external++;
    }

    // Cheap regex-based HTML inspection (avoid pulling DOM parser into edge runtime)
    const h1Matches = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => stripTags(m[1]).trim()).filter(Boolean);
    const h2Count = (html.match(/<h2[^>]*>/gi) || []).length;
    const h3Count = (html.match(/<h3[^>]*>/gi) || []).length;
    const h4Count = (html.match(/<h4[^>]*>/gi) || []).length;
    const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
    const imagesMissingAlt = imgs.filter((tag) => !/\balt\s*=\s*["'][^"']+["']/i.test(tag)).length;
    const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    const hasHtmlLang = /<html[^>]+\blang\s*=\s*["'][^"']+["']/i.test(html);
    const ogTitle = matchAttr(html, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
    const ogDescription = matchAttr(html, /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i);

    // Extract JSON-LD blocks and pull @type values
    const jsonLdTypes: string[] = [];
    const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of ldMatches) {
      try {
        const parsed = JSON.parse(m[1].trim());
        const collect = (node: any) => {
          if (!node) return;
          if (Array.isArray(node)) { node.forEach(collect); return; }
          if (typeof node === "object") {
            const t = node["@type"];
            if (typeof t === "string") jsonLdTypes.push(t);
            else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && jsonLdTypes.push(x));
            if (Array.isArray(node["@graph"])) node["@graph"].forEach(collect);
          }
        };
        collect(parsed);
      } catch {
        /* ignore malformed JSON-LD */
      }
    }

    // FAQ-style content (good for AEO): count "?" lines in markdown
    const faqCount = (markdown.match(/\n\s*[#*-]?\s*[^?\n]{8,200}\?/g) || []).length;

    return {
      url,
      status,
      title: String(meta.title || "").slice(0, 300),
      description: String(meta.description || "").slice(0, 500),
      h1: h1Matches.slice(0, 5),
      headingCounts: { h1: h1Matches.length, h2: h2Count, h3: h3Count, h4: h4Count },
      wordCount: markdown.split(/\s+/).filter(Boolean).length,
      internalLinks: internal,
      externalLinks: external,
      imagesTotal: imgs.length,
      imagesMissingAlt,
      hasCanonical,
      hasViewport,
      hasHtmlLang,
      ogTitle,
      ogDescription,
      jsonLdTypes: Array.from(new Set(jsonLdTypes)),
      faqCount,
      markdownPreview: markdown.slice(0, 500),
    };
  } catch (e) {
    return emptyPage(url, e instanceof Error ? e.message : "scrape error");
  }
}

function emptyPage(url: string, error: string): ScrapedPage {
  return {
    url, status: 0, title: "", description: "", h1: [],
    headingCounts: { h1: 0, h2: 0, h3: 0, h4: 0 },
    wordCount: 0,
    internalLinks: 0, externalLinks: 0,
    imagesTotal: 0, imagesMissingAlt: 0,
    hasCanonical: false, hasViewport: false, hasHtmlLang: false,
    ogTitle: "", ogDescription: "",
    jsonLdTypes: [], faqCount: 0,
    markdownPreview: "", error,
  };
}

function safeHost(u: string): string | null {
  try { return new URL(u).host; } catch { return null; }
}
function stripTags(s: string): string { return s.replace(/<[^>]+>/g, ""); }
function matchAttr(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? m[1] : "";
}

/**
 * Deterministic per-page issues + per-category scores.
 * Categories: onPage, structuredData, aeo. Performance is computed at the site level.
 * Each category starts at 100 and is reduced by issue weights.
 */
function gradePage(p: ScrapedPage): {
  scores: { onPage: number; structuredData: number; aeo: number; overall: number };
  issues: GradedIssue[];
} {
  const issues: GradedIssue[] = [];
  const sub = { onPage: 100, structuredData: 100, aeo: 100 };
  const deduct = (cat: "onPage" | "structuredData" | "aeo", n: number) => {
    sub[cat] = Math.max(0, sub[cat] - n);
  };

  if (p.error || p.status === 0) {
    issues.push({ severity: "error", code: "fetch_failed", category: "onPage", message: p.error || "Page failed to load" });
    return { scores: { onPage: 0, structuredData: 0, aeo: 0, overall: 0 }, issues };
  }
  if (p.status >= 400) {
    issues.push({ severity: "error", code: "http_error", category: "onPage", message: `HTTP ${p.status}` });
    deduct("onPage", 50);
  }

  // ---------- On-Page ----------
  if (!p.title) { issues.push({ severity: "error", code: "missing_title", category: "onPage", message: "Missing <title> tag", field: "seoTitle" }); deduct("onPage", 20); }
  else if (p.title.length < SEO_RULES.title.min) { issues.push({ severity: "warning", code: "short_title", category: "onPage", message: `Title is short (${p.title.length} chars, aim ${SEO_RULES.title.min}–${SEO_RULES.title.max})`, field: "seoTitle" }); deduct("onPage", 6); }
  else if (p.title.length > SEO_RULES.title.soft_max) { issues.push({ severity: "warning", code: "long_title", category: "onPage", message: `Title is long (${p.title.length} chars, max ${SEO_RULES.title.max})`, field: "seoTitle" }); deduct("onPage", 4); }

  if (!p.description) { issues.push({ severity: "error", code: "missing_meta_desc", category: "onPage", message: "Missing meta description", field: "seoDescription" }); deduct("onPage", 15); }
  else if (p.description.length < SEO_RULES.metaDescription.soft_min) { issues.push({ severity: "warning", code: "short_desc", category: "onPage", message: `Meta description is short (${p.description.length} chars, aim ${SEO_RULES.metaDescription.min}–${SEO_RULES.metaDescription.max})`, field: "seoDescription" }); deduct("onPage", 5); }
  else if (p.description.length > SEO_RULES.metaDescription.soft_max) { issues.push({ severity: "info", code: "long_desc", category: "onPage", message: `Meta description is long (${p.description.length} chars, max ${SEO_RULES.metaDescription.max})`, field: "seoDescription" }); deduct("onPage", 2); }

  if (p.headingCounts.h1 === 0) { issues.push({ severity: "error", code: "missing_h1", category: "onPage", message: "No H1 heading on the page", field: "h1" }); deduct("onPage", 12); }
  else if (p.headingCounts.h1 > 1) { issues.push({ severity: "warning", code: "multiple_h1", category: "onPage", message: `Multiple H1 tags on page (${p.headingCounts.h1})`, field: "h1" }); deduct("onPage", 6); }

  // Heading hierarchy: h1 should be followed by some h2/h3 if there's content
  if (p.headingCounts.h1 >= 1 && p.headingCounts.h2 === 0 && p.wordCount > 200) {
    issues.push({ severity: "warning", code: "weak_heading_hierarchy", category: "onPage", message: "Weak heading hierarchy (no H2 sections)", field: "headings" });
    deduct("onPage", 4);
  }

  if (!p.hasViewport) { issues.push({ severity: "error", code: "no_viewport", category: "onPage", message: "Missing viewport meta tag", field: "viewport" }); deduct("onPage", 10); }
  if (!p.hasHtmlLang) { issues.push({ severity: "warning", code: "no_html_lang", category: "onPage", message: "Missing <html lang> attribute", field: "htmlLang" }); deduct("onPage", 4); }
  if (!p.hasCanonical) { issues.push({ severity: "warning", code: "no_canonical", category: "onPage", message: "Missing canonical URL", field: "canonical" }); deduct("onPage", 4); }

  if (p.imagesTotal > 0 && p.imagesMissingAlt > 0) {
    const ratio = p.imagesMissingAlt / Math.max(1, p.imagesTotal);
    const sev: IssueSeverity = ratio > 0.5 ? "warning" : "info";
    issues.push({ severity: sev, code: "missing_alt", category: "onPage", message: `${p.imagesMissingAlt} of ${p.imagesTotal} image(s) missing alt text`, field: "altText" });
    deduct("onPage", Math.min(10, p.imagesMissingAlt));
  }

  // ---------- Structured Data ----------
  if (p.jsonLdTypes.length === 0) {
    issues.push({ severity: "warning", code: "no_structured_data", category: "structuredData", message: "No JSON-LD structured data found", field: "schema" });
    deduct("structuredData", 40);
  } else {
    // Bonus signals: Product, BreadcrumbList, Organization, FAQPage
    const hasProduct = p.jsonLdTypes.some((t) => /Product/i.test(t));
    const hasBreadcrumb = p.jsonLdTypes.some((t) => /Breadcrumb/i.test(t));
    const hasOrg = p.jsonLdTypes.some((t) => /(Organization|WebSite)/i.test(t));
    const looksLikeProduct = /\/products?\//i.test(p.url);
    if (looksLikeProduct && !hasProduct) {
      issues.push({ severity: "warning", code: "missing_product_schema", category: "structuredData", message: "Product page is missing Product schema", field: "schema" });
      deduct("structuredData", 25);
    }
    if (!hasBreadcrumb) {
      issues.push({ severity: "info", code: "no_breadcrumb_schema", category: "structuredData", message: "No BreadcrumbList schema", field: "schema" });
      deduct("structuredData", 8);
    }
    if (!hasOrg) {
      issues.push({ severity: "info", code: "no_org_schema", category: "structuredData", message: "No Organization/WebSite schema", field: "schema" });
      deduct("structuredData", 5);
    }
  }

  if (!p.ogTitle && !p.ogDescription) {
    issues.push({ severity: "info", code: "no_og", category: "structuredData", message: "No Open Graph metadata", field: "og" });
    deduct("structuredData", 8);
  }

  // ---------- AEO (Answer Engine Optimization) ----------
  if (p.wordCount < SEO_RULES.bodyContent.minWords) {
    issues.push({ severity: "warning", code: "thin_content", category: "aeo", message: `Thin content (${p.wordCount} words, aim ${SEO_RULES.bodyContent.minWords}+)`, field: "content" });
    deduct("aeo", 25);
  }
  if (p.faqCount === 0 && p.wordCount > 300) {
    issues.push({ severity: "info", code: "no_question_content", category: "aeo", message: "No question-style content (good for AI answer engines)", field: "content" });
    deduct("aeo", 10);
  }
  if (p.headingCounts.h2 === 0 && p.wordCount > 200) {
    issues.push({ severity: "info", code: "aeo_no_subheadings", category: "aeo", message: "No H2 subheadings — answer engines prefer scannable structure", field: "headings" });
    deduct("aeo", 8);
  }
  if (p.jsonLdTypes.some((t) => /FAQPage/i.test(t))) {
    // small bonus: don't penalize, but give a hint that this is good
  } else if (p.faqCount >= 3) {
    issues.push({ severity: "info", code: "faq_no_schema", category: "aeo", message: "Question content found but no FAQPage schema", field: "schema" });
    deduct("aeo", 5);
  }

  const overall = Math.round((sub.onPage + sub.structuredData + sub.aeo) / 3);
  return { scores: { ...sub, overall }, issues };
}

/** Extract the last meaningful path segment from a URL (the likely product handle). */
function extractHandleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length === 0) return null;
    const last = segs[segs.length - 1].toLowerCase();
    if (!last || last.length > 100) return null;
    return last;
  } catch {
    return null;
  }
}

async function aiSummary(pages: ScrapedPage[], rootUrl: string, lovableKey: string): Promise<{ summary: string; topRecommendations: string[] }> {
  // Compact payload for the AI
  const sample = pages.slice(0, 30).map((p) => ({
    url: p.url, title: p.title, description: p.description,
    h1: p.h1[0] || "", wordCount: p.wordCount,
    issues: gradePage(p).issues.map((i) => i.code),
  }));

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are an SEO consultant. Be concise and actionable." },
          { role: "user", content: `Site: ${rootUrl}\nPages analyzed: ${pages.length}\nPer-page summary:\n${JSON.stringify(sample, null, 2)}\n\nReturn a 2-3 sentence overall summary and 5 top recommendations.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "report_summary",
            description: "Return overall SEO summary and top recommendations",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "2-3 sentence overall site SEO summary" },
                topRecommendations: { type: "array", items: { type: "string" }, description: "5 prioritized, specific recommendations" },
              },
              required: ["summary", "topRecommendations"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "report_summary" } },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI summary failed:", resp.status, t);
      return { summary: `Scanned ${pages.length} page(s) on ${rootUrl}.`, topRecommendations: [] };
    }
    const data = await resp.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) return { summary: `Scanned ${pages.length} page(s).`, topRecommendations: [] };
    return JSON.parse(tc.function.arguments);
  } catch (e) {
    console.error("AI summary error:", e);
    return { summary: `Scanned ${pages.length} page(s) on ${rootUrl}.`, topRecommendations: [] };
  }
}

export async function runAudit(scan: ScanRow): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");

  const adminClient = createClient(supabaseUrl, serviceKey);

  if (!firecrawlKey) {
    await patchScan(adminClient, scan.id, { status: "error", phase: "error", error_message: "FIRECRAWL_API_KEY is not configured" });
    return;
  }

  try {
    await patchScan(adminClient, scan.id, { status: "running", phase: "mapping" });

    const limits = SCOPE_LIMITS[scan.scope] || SCOPE_LIMITS.standard;
    const urls = await firecrawlMap(scan.root_url, limits.pages, firecrawlKey);

    await patchScan(adminClient, scan.id, {
      phase: "scanning",
      pages_total: urls.length,
      discovered_url_count: urls.length,
    });

    const pages = await scrapeManyWithProgress(adminClient, scan.id, urls, firecrawlKey, 0);

    await patchScan(adminClient, scan.id, { phase: "grading" });

    const report = await assembleReport(adminClient, scan, pages, lovableKey);

    await patchScan(adminClient, scan.id, {
      status: "complete",
      phase: "complete",
      pages_scanned: pages.length,
      report,
      error_message: null,
    });
  } catch (e) {
    console.error("runAudit error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    await patchScan(adminClient, scan.id, { status: "error", phase: "error", error_message: msg });
  }
}

/** Extend an existing complete scan: discover more URLs, scrape only new ones, merge + regrade. */
export async function extendAudit(scanId: string, opts?: { url?: string }): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");

  const adminClient = createClient(supabaseUrl, serviceKey);

  if (!firecrawlKey) {
    await patchScan(adminClient, scanId, { status: "error", phase: "error", error_message: "FIRECRAWL_API_KEY is not configured" });
    return;
  }

  try {
    const { data: row, error } = await adminClient
      .from("seo_scans")
      .select("id, root_url, scope, organization_id, report, pages_scanned, pages_total")
      .eq("id", scanId)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message || "Scan not found");

    const existingPages = (row.report?.pages || []) as ScanReportPage[];
    const existingUrls = new Set(existingPages.map((p) => p.url));

    if (existingUrls.size >= EXTEND_MAX_TOTAL) {
      throw new Error(`Scan already at the ${EXTEND_MAX_TOTAL}-page ceiling`);
    }

    await patchScan(adminClient, scanId, { status: "running", phase: "mapping", error_message: null });

    let newUrls: string[] = [];
    if (opts?.url) {
      // Single-URL mode: validate and ensure it's on the same host as the root.
      let target: URL;
      try { target = new URL(opts.url); } catch { throw new Error("Invalid URL"); }
      if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("Only http(s) URLs are allowed");
      try {
        const rootHost = new URL(row.root_url).host;
        if (target.host !== rootHost) throw new Error(`URL must be on ${rootHost}`);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("URL must be on")) throw e;
      }
      const normalized = target.toString();
      if (existingUrls.has(normalized)) throw new Error("This page is already in the report");
      newUrls = [normalized];
    } else {
      // Discover a wider URL set, then filter out what we already scanned.
      const discoverCap = Math.min(EXTEND_MAX_TOTAL, existingUrls.size + EXTEND_BATCH_SIZE * 4);
      const discovered = await firecrawlMap(row.root_url, discoverCap, firecrawlKey);
      newUrls = discovered.filter((u) => !existingUrls.has(u)).slice(0, EXTEND_BATCH_SIZE);
    }

    if (newUrls.length === 0) {
      // Nothing new to scan; leave the existing report intact and mark complete.
      await patchScan(adminClient, scanId, {
        status: "complete",
        phase: "complete",
        error_message: "No new pages discovered to add.",
      });
      return;
    }

    const newTotal = existingUrls.size + newUrls.length;
    await patchScan(adminClient, scanId, {
      phase: "scanning",
      pages_total: newTotal,
      discovered_url_count: Math.max(row.pages_total || 0, newTotal),
    });

    const newPages = await scrapeManyWithProgress(adminClient, scanId, newUrls, firecrawlKey, existingUrls.size);

    await patchScan(adminClient, scanId, { phase: "grading" });

    // Merge: rebuild ScrapedPage-shaped objects from existingPages so we can re-grade everything.
    const mergedScraped: ScrapedPage[] = [
      ...existingPages.map(rehydrateScraped),
      ...newPages,
    ];

    const scanRow: ScanRow = {
      id: row.id,
      root_url: row.root_url,
      scope: row.scope as keyof typeof SCOPE_LIMITS,
      organization_id: row.organization_id,
    };
    const report = await assembleReport(adminClient, scanRow, mergedScraped, lovableKey);

    await patchScan(adminClient, scanId, {
      status: "complete",
      phase: "complete",
      pages_scanned: mergedScraped.length,
      pages_total: mergedScraped.length,
      report,
      error_message: null,
    });
  } catch (e) {
    console.error("extendAudit error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    await patchScan(adminClient, scanId, { status: "error", phase: "error", error_message: msg });
  }
}

/** Type used for already-stored report pages (subset we read back from JSON). */
type ScanReportPage = {
  url: string; status: number; title: string; description: string;
  h1?: string[]; headingCounts?: { h1: number; h2: number; h3: number; h4: number };
  wordCount?: number; internalLinks?: number; externalLinks?: number;
  imagesTotal?: number; imagesMissingAlt?: number;
  hasCanonical?: boolean; hasViewport?: boolean; hasHtmlLang?: boolean;
  jsonLdTypes?: string[];
};

/** Rebuild a ScrapedPage from a stored report page so we can re-grade it without re-scraping. */
function rehydrateScraped(p: ScanReportPage): ScrapedPage {
  return {
    url: p.url,
    status: p.status ?? 200,
    title: p.title || "",
    description: p.description || "",
    h1: p.h1 || [],
    headingCounts: p.headingCounts || { h1: (p.h1?.length || 0), h2: 0, h3: 0, h4: 0 },
    wordCount: p.wordCount ?? 0,
    internalLinks: p.internalLinks ?? 0,
    externalLinks: p.externalLinks ?? 0,
    imagesTotal: p.imagesTotal ?? 0,
    imagesMissingAlt: p.imagesMissingAlt ?? 0,
    hasCanonical: !!p.hasCanonical,
    hasViewport: !!p.hasViewport,
    hasHtmlLang: !!p.hasHtmlLang,
    ogTitle: "",
    ogDescription: "",
    jsonLdTypes: p.jsonLdTypes || [],
    faqCount: 0,
    markdownPreview: "",
  };
}

async function scrapeManyWithProgress(
  adminClient: any,
  scanId: string,
  urls: string[],
  firecrawlKey: string,
  startCount: number,
): Promise<ScrapedPage[]> {
  const pages: ScrapedPage[] = [];
  const concurrency = 3;
  let cursor = 0;
  let scanned = startCount;

  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= urls.length) return;
      const page = await firecrawlScrape(urls[idx], firecrawlKey);
      pages.push(page);
      scanned++;
      await patchScan(adminClient, scanId, { pages_scanned: scanned });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return pages;
}

async function assembleReport(adminClient: any, scan: ScanRow, pages: ScrapedPage[], lovableKey: string | undefined) {
  // Match scanned URLs to Brand Aura products by URL handle (Shopify-style /products/<handle>).
  const handles = new Set<string>();
  for (const p of pages) {
    const h = extractHandleFromUrl(p.url);
    if (h) handles.add(h);
  }
  const handleToProduct: Record<string, { productId: string; listingId: string | null; marketplace: string | null }> = {};
  if (handles.size > 0) {
    const { data: listingMatches } = await adminClient
      .from("listings")
      .select("id, product_id, url_handle, marketplace, products!inner(organization_id)")
      .in("url_handle", Array.from(handles))
      .eq("products.organization_id", scan.organization_id);
    for (const row of listingMatches || []) {
      const h = String((row as any).url_handle || "").toLowerCase();
      if (h && !handleToProduct[h]) {
        handleToProduct[h] = { productId: (row as any).product_id, listingId: (row as any).id, marketplace: (row as any).marketplace };
      }
    }
  }

  const gradedPages = pages.map((p) => {
    const { scores, issues } = gradePage(p);
    const handle = extractHandleFromUrl(p.url);
    const productMatch = handle ? handleToProduct[handle] || null : null;
    return { ...p, score: scores.overall, scores, issues, productMatch };
  });

  const overallScore = gradedPages.length
    ? Math.round(gradedPages.reduce((s, p) => s + p.score, 0) / gradedPages.length)
    : 0;

  const avg = (key: "onPage" | "structuredData" | "aeo") =>
    gradedPages.length
      ? Math.round(gradedPages.reduce((s, p) => s + p.scores[key], 0) / gradedPages.length)
      : 0;
  const categoryScores = {
    onPage: avg("onPage"),
    structuredData: avg("structuredData"),
    aeo: avg("aeo"),
    performance: 0,
  };

  const issueCounts = { error: 0, warning: 0, info: 0 };
  for (const p of gradedPages) for (const i of p.issues) issueCounts[i.severity]++;

  const grouped: Record<string, { code: string; severity: IssueSeverity; category: IssueCategory; message: string; pages: { url: string; title: string }[] }> = {};
  for (const p of gradedPages) {
    for (const i of p.issues) {
      if (!grouped[i.code]) {
        grouped[i.code] = { code: i.code, severity: i.severity, category: i.category, message: i.message, pages: [] };
      }
      grouped[i.code].pages.push({ url: p.url, title: p.title });
    }
  }
  const groupedIssues = Object.values(grouped).sort((a, b) => {
    const sevRank = { error: 0, warning: 1, info: 2 };
    if (sevRank[a.severity] !== sevRank[b.severity]) return sevRank[a.severity] - sevRank[b.severity];
    return b.pages.length - a.pages.length;
  });

  const ai = lovableKey
    ? await aiSummary(pages, scan.root_url, lovableKey)
    : { summary: `Scanned ${pages.length} page(s).`, topRecommendations: [] };

  return {
    rootUrl: scan.root_url,
    scope: scan.scope,
    overallScore,
    categoryScores,
    issueCounts,
    summary: ai.summary,
    topRecommendations: ai.topRecommendations,
    groupedIssues,
    pages: gradedPages.map((p) => ({
      url: p.url,
      status: p.status,
      title: p.title,
      description: p.description,
      h1: p.h1,
      headingCounts: p.headingCounts,
      wordCount: p.wordCount,
      internalLinks: p.internalLinks,
      externalLinks: p.externalLinks,
      imagesTotal: p.imagesTotal,
      imagesMissingAlt: p.imagesMissingAlt,
      hasCanonical: p.hasCanonical,
      hasViewport: p.hasViewport,
      hasHtmlLang: p.hasHtmlLang,
      jsonLdTypes: p.jsonLdTypes,
      score: p.score,
      scores: p.scores,
      issues: p.issues,
      productMatch: p.productMatch,
    })),
    generatedAt: new Date().toISOString(),
  };
}
