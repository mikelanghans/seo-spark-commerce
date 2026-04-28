// Shared SEO audit pipeline: Firecrawl map → scrape → Lovable AI grade.
// Designed to run inside an EdgeRuntime.waitUntil background task.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SEO_RULES } from "./seo-rules.ts";

export const SCOPE_LIMITS: Record<string, { pages: number; maxDepth: number }> = {
  quick: { pages: 10, maxDepth: 2 },
  standard: { pages: 50, maxDepth: 3 },
  deep: { pages: 200, maxDepth: 5 },
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

type ScanRow = {
  id: string;
  root_url: string;
  scope: keyof typeof SCOPE_LIMITS;
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
  const links: string[] = data.links || data.data?.links || [];
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
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  imagesMissingAlt: number;
  hasCanonical: boolean;
  hasViewport: boolean;
  ogTitle: string;
  ogDescription: string;
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
    const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
    const imagesMissingAlt = imgs.filter((tag) => !/\balt\s*=\s*["'][^"']+["']/i.test(tag)).length;
    const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
    const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
    const ogTitle = matchAttr(html, /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i);
    const ogDescription = matchAttr(html, /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']*)["']/i);

    return {
      url,
      status,
      title: String(meta.title || "").slice(0, 300),
      description: String(meta.description || "").slice(0, 500),
      h1: h1Matches.slice(0, 5),
      wordCount: markdown.split(/\s+/).filter(Boolean).length,
      internalLinks: internal,
      externalLinks: external,
      imagesMissingAlt,
      hasCanonical,
      hasViewport,
      ogTitle,
      ogDescription,
      markdownPreview: markdown.slice(0, 500),
    };
  } catch (e) {
    return emptyPage(url, e instanceof Error ? e.message : "scrape error");
  }
}

function emptyPage(url: string, error: string): ScrapedPage {
  return {
    url, status: 0, title: "", description: "", h1: [], wordCount: 0,
    internalLinks: 0, externalLinks: 0, imagesMissingAlt: 0,
    hasCanonical: false, hasViewport: false, ogTitle: "", ogDescription: "",
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

// Deterministic per-page issues + score (no AI). Uses SEO_RULES so grading
// matches the constraints we apply during listing generation.
function gradePage(p: ScrapedPage): { score: number; issues: { severity: "error" | "warning" | "info"; code: string; message: string; field?: string }[] } {
  const issues: { severity: "error" | "warning" | "info"; code: string; message: string; field?: string }[] = [];
  let score = 100;

  if (p.error || p.status === 0) {
    issues.push({ severity: "error", code: "fetch_failed", message: p.error || "Page failed to load" });
    return { score: 0, issues };
  }
  if (p.status >= 400) {
    issues.push({ severity: "error", code: "http_error", message: `HTTP ${p.status}` });
    score -= 50;
  }
  if (!p.title) { issues.push({ severity: "error", code: "missing_title", message: "Missing <title>", field: "seoTitle" }); score -= 15; }
  else if (p.title.length < SEO_RULES.title.min) { issues.push({ severity: "warning", code: "short_title", message: `Title is short (${p.title.length} chars, aim ${SEO_RULES.title.min}–${SEO_RULES.title.max})`, field: "seoTitle" }); score -= 5; }
  else if (p.title.length > SEO_RULES.title.soft_max) { issues.push({ severity: "warning", code: "long_title", message: `Title is long (${p.title.length} chars, max ${SEO_RULES.title.max})`, field: "seoTitle" }); score -= 3; }

  if (!p.description) { issues.push({ severity: "warning", code: "missing_meta_desc", message: "Missing meta description", field: "seoDescription" }); score -= 10; }
  else if (p.description.length < SEO_RULES.metaDescription.soft_min) { issues.push({ severity: "info", code: "short_desc", message: `Meta description is short (${p.description.length} chars, aim ${SEO_RULES.metaDescription.min}–${SEO_RULES.metaDescription.max})`, field: "seoDescription" }); score -= 3; }
  else if (p.description.length > SEO_RULES.metaDescription.soft_max) { issues.push({ severity: "info", code: "long_desc", message: `Meta description is long (${p.description.length} chars, max ${SEO_RULES.metaDescription.max})`, field: "seoDescription" }); score -= 2; }

  if (p.h1.length === 0) { issues.push({ severity: "warning", code: "missing_h1", message: "No H1 tag", field: "h1" }); score -= 8; }
  else if (p.h1.length > 1) { issues.push({ severity: "info", code: "multiple_h1", message: `${p.h1.length} H1 tags found`, field: "h1" }); score -= 3; }

  if (p.wordCount < SEO_RULES.bodyContent.minWords) { issues.push({ severity: "warning", code: "thin_content", message: `Only ${p.wordCount} words of content (aim ${SEO_RULES.bodyContent.minWords}+)`, field: "description" }); score -= 8; }
  if (p.imagesMissingAlt > 0) { issues.push({ severity: "warning", code: "missing_alt", message: `${p.imagesMissingAlt} image(s) missing alt text`, field: "altText" }); score -= Math.min(10, p.imagesMissingAlt); }
  if (!p.hasCanonical) { issues.push({ severity: "info", code: "no_canonical", message: "No canonical link tag", field: "canonical" }); score -= 2; }
  if (!p.hasViewport) { issues.push({ severity: "warning", code: "no_viewport", message: "No viewport meta tag (mobile)", field: "viewport" }); score -= 5; }
  if (!p.ogTitle && !p.ogDescription) { issues.push({ severity: "info", code: "no_og", message: "No Open Graph metadata", field: "og" }); score -= 3; }

  return { score: Math.max(0, score), issues };
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

    const pages: ScrapedPage[] = [];
    // Concurrency 3 to keep memory + rate limits in check
    const concurrency = 3;
    let cursor = 0;
    let scanned = 0;

    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= urls.length) return;
        const page = await firecrawlScrape(urls[idx], firecrawlKey!);
        pages.push(page);
        scanned++;
        // Patch progress every page (cheap)
        await patchScan(adminClient, scan.id, { pages_scanned: scanned });
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));

    await patchScan(adminClient, scan.id, { phase: "grading" });

    const gradedPages = pages.map((p) => {
      const { score, issues } = gradePage(p);
      return { ...p, score, issues };
    });

    const overallScore = gradedPages.length
      ? Math.round(gradedPages.reduce((s, p) => s + p.score, 0) / gradedPages.length)
      : 0;

    const issueCounts = { error: 0, warning: 0, info: 0 };
    for (const p of gradedPages) for (const i of p.issues) issueCounts[i.severity]++;

    const ai = lovableKey ? await aiSummary(pages, scan.root_url, lovableKey) : { summary: `Scanned ${pages.length} page(s).`, topRecommendations: [] };

    const report = {
      rootUrl: scan.root_url,
      scope: scan.scope,
      overallScore,
      issueCounts,
      summary: ai.summary,
      topRecommendations: ai.topRecommendations,
      pages: gradedPages.map((p) => ({
        url: p.url,
        status: p.status,
        title: p.title,
        description: p.description,
        h1: p.h1,
        wordCount: p.wordCount,
        internalLinks: p.internalLinks,
        externalLinks: p.externalLinks,
        imagesMissingAlt: p.imagesMissingAlt,
        hasCanonical: p.hasCanonical,
        hasViewport: p.hasViewport,
        score: p.score,
        issues: p.issues,
      })),
      generatedAt: new Date().toISOString(),
    };

    await patchScan(adminClient, scan.id, {
      status: "complete",
      phase: "complete",
      pages_scanned: scanned,
      report,
      error_message: null,
    });
  } catch (e) {
    console.error("runAudit error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    await patchScan(adminClient, scan.id, { status: "error", phase: "error", error_message: msg });
  }
}
