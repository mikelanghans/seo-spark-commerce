import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserIdFromAuth, deductCredits, insufficientCreditsResponse } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_MODEL = "google/gemini-2.5-flash-lite";
const AI_TIMEOUT_MS = 25000;

const clamp = (v: unknown, max: number, fb = ""): string =>
  (typeof v === "string" ? v.trim() : fb).slice(0, max);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await getUserIdFromAuth(req);
    if (userId) {
      const ok = await deductCredits(userId, "suggest-keywords-tags");
      if (!ok) return insufficientCreditsResponse("suggest-keywords-tags");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const business = body.business || {};
    const product = body.product || {};
    const marketplace = clamp(body.marketplace, 20, "shopify").toLowerCase();
    const existingTags: string[] = Array.isArray(body.existingTags)
      ? body.existingTags.filter((t: unknown) => typeof t === "string").map((t: string) => t.trim()).filter(Boolean)
      : [];
    const excludedSections: string[] = Array.isArray(body.excludedSections)
      ? body.excludedSections.filter((s: unknown) => typeof s === "string")
      : [];

    const ctx = {
      brand: clamp(business.name, 80, "Unknown brand"),
      niche: clamp(business.niche, 80, "General"),
      audience: clamp(business.audience, 120, "General shoppers"),
      tone: clamp(business.tone, 60, "Professional"),
      productTitle: clamp(product.title, 140, "Untitled product"),
      productCategory: clamp(product.category, 80, "General"),
      description: clamp(product.description, 600),
      existing: existingTags.slice(0, 30).join(", "),
    };

    // Marketplace-specific tag rules
    const marketplaceRules: Record<string, string> = {
      etsy: "Etsy allows up to 13 tags, max 20 chars each, lowercase, multi-word phrases (e.g. 'cosmic earth tee') strongly preferred over single words. Focus on shopper search phrases (long-tail, gift occasions, recipient, style descriptors).",
      ebay: "eBay item specifics-style keywords: brand, type, style, color, occasion, recipient. Concise 1–3 word phrases. Buyer-intent focused.",
      shopify: "Shopify tags double as product taxonomy + SEO. Use 1–3 word phrases mixing category, style, audience, occasion, and trending modifiers.",
      tiktok: "TikTok Shop has NO separate tag field — keywords get woven into the title and description. Suggest punchy, trend-aware phrases (1–4 words) that read naturally inside copy: shopper-intent terms, viral aesthetics ('coquette', 'cottagecore', 'y2k' if genuinely relevant), gift occasions, recipient. Skip stiff e-commerce jargon.",
    };
    const rule = marketplaceRules[marketplace] || marketplaceRules.shopify;

    // Build exclusion guidance based on the brand's "Exclude from Listings" settings
    const exclusionLines: string[] = [];
    const excludedKeywordTerms: string[] = [];
    if (excludedSections.includes("materials")) {
      exclusionLines.push("- Materials / fabric / fit / sizing / fabric composition / garment specs (the storefront displays these separately).");
      excludedKeywordTerms.push("cotton", "polyester", "fabric", "fit", "size", "sizing", "material", "garment dye", "ringspun", "heavyweight", "lightweight", "soft tee");
    }
    if (excludedSections.includes("care")) {
      exclusionLines.push("- Care instructions / wash / dry / iron / care guide.");
      excludedKeywordTerms.push("machine wash", "wash cold", "tumble dry", "easy care", "care instructions");
    }
    if (excludedSections.includes("shipping")) {
      exclusionLines.push("- Shipping / delivery / fast shipping / free shipping / returns / refund policy.");
      excludedKeywordTerms.push("fast shipping", "free shipping", "quick delivery", "easy returns", "ships fast", "ships free");
    }
    const exclusionBlock = exclusionLines.length
      ? `\n\nCONTENT EXCLUSIONS — STRICT (do NOT propose any tag or keyword touching these topics):\n${exclusionLines.join("\n")}\nAlso avoid these specific terms or near-variants: ${excludedKeywordTerms.join(", ")}.\nFocus instead on the product story, design theme, audience, mood, gifting context, and brand voice.`
      : "";

    const prompt = `You are an SEO and marketplace search expert. Suggest fresh KEYWORD and TAG ideas for one product, tightly tailored to its category and target audience.

PRODUCT
- Title: ${ctx.productTitle}
- Category (the actual physical product): ${ctx.productCategory}
- Description: ${ctx.description}

BRAND CONTEXT
- Brand: ${ctx.brand}
- Niche: ${ctx.niche}
- Tone: ${ctx.tone}
- Target Audience: ${ctx.audience}

MARKETPLACE: ${marketplace}
- Marketplace rules: ${rule}

ALREADY-USED TAGS (do NOT repeat these or near-duplicates): ${ctx.existing || "(none)"}${exclusionBlock}

YOUR JOB
Generate two lists:
1. "tags": 12 short marketplace tags following the rules above. Lowercase plain text, no '#', no quotes. Each must be NEW (not in already-used list, no near-duplicates). Mix:
   - product-type tags (anchored to "${ctx.productCategory}")
   - audience / recipient tags (who it's for)
   - occasion / gifting tags
   - style / aesthetic tags
   - seasonal / trend tags (only if naturally relevant)
2. "keywords": 8 longer-tail SEO search phrases (3–6 words each) a real shopper would type. Lowercase. Must include the product category word in most.

Also return:
- "rationale": ONE short sentence explaining the angle you took (plain text, max 160 chars).

Plain text only. No markdown. No emojis.`;

    const schema = {
      type: "object",
      properties: {
        tags: { type: "array", items: { type: "string" } },
        keywords: { type: "array", items: { type: "string" } },
        rationale: { type: "string" },
      },
      required: ["tags", "keywords", "rationale"],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort("AI gateway timeout"), AI_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          temperature: 0.6,
          messages: [
            { role: "system", content: "You are an e-commerce SEO and marketplace tag expert. You MUST call the suggest_keywords_tags function." },
            { role: "user", content: prompt },
          ],
          tools: [{
            type: "function",
            function: {
              name: "suggest_keywords_tags",
              description: "Return fresh keyword + tag suggestions for the product",
              parameters: schema,
            },
          }],
          tool_choice: { type: "function", function: { name: "suggest_keywords_tags" } },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits and try again." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const txt = await response.text();
      console.error("AI gateway error:", status, txt);
      return new Response(JSON.stringify({ error: `AI gateway error: ${status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");
    const parsed = JSON.parse(toolCall.function.arguments);

    // Build forbidden-substring list from excluded sections (defense-in-depth)
    const forbiddenSubstrings: string[] = [];
    if (excludedSections.includes("materials")) {
      forbiddenSubstrings.push("cotton", "polyester", "fabric", " fit", "fitted", "sizing", "size guide", "material", "garment", "ringspun", "heavyweight", "lightweight", "soft tee", "cozy fit");
    }
    if (excludedSections.includes("care")) {
      forbiddenSubstrings.push("wash", "dry", "iron", "care instruction", "easy care");
    }
    if (excludedSections.includes("shipping")) {
      forbiddenSubstrings.push("shipping", "delivery", "ships ", "return", "refund");
    }

    // Sanitize: lowercase, dedupe, strip excluded topics
    const existingLower = new Set(existingTags.map((t) => t.toLowerCase()));
    const seen = new Set<string>();
    const cleanList = (arr: unknown, max: number): string[] => {
      if (!Array.isArray(arr)) return [];
      const out: string[] = [];
      for (const raw of arr) {
        if (typeof raw !== "string") continue;
        const t = raw.trim().replace(/^#+/, "").replace(/^["']|["']$/g, "").toLowerCase();
        if (!t || t.length > 50) continue;
        if (existingLower.has(t) || seen.has(t)) continue;
        if (forbiddenSubstrings.some((bad) => t.includes(bad))) continue;
        seen.add(t);
        out.push(t);
        if (out.length >= max) break;
      }
      return out;
    };

    return new Response(
      JSON.stringify({
        tags: cleanList(parsed.tags, 12),
        keywords: cleanList(parsed.keywords, 8),
        rationale: clamp(parsed.rationale, 200),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || e.message.includes("timeout"))) {
      return new Response(JSON.stringify({ error: "Suggestion request timed out. Please retry." }), {
        status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("suggest-keywords-tags error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
