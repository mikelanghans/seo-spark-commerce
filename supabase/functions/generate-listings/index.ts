import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserIdFromAuth, deductCredits, insufficientCreditsResponse } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_REQUEST_TIMEOUT_MS = 35000;
const AI_MODEL = "google/gemini-2.5-flash-lite";
const AI_RETRY_ATTEMPTS = 2;

const cleanText = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value.trim() : fallback;

const clampText = (value: unknown, max: number, fallback = ""): string =>
  cleanText(value, fallback).slice(0, max);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Credit pre-check
    const userId = await getUserIdFromAuth(req);
    if (userId) {
      const ok = await deductCredits(userId, "generate-listings");
      if (!ok) return insufficientCreditsResponse("generate-listings");
    }

    const {
      business = {},
      product = {},
      marketplaces: requestedMarketplaces,
      excludedSections,
      enhanceOnly = false,
    } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const allMarketplaces = ["etsy", "ebay", "shopify"];
    const marketplaces = (requestedMarketplaces && requestedMarketplaces.length > 0)
      ? requestedMarketplaces.filter((m: string) => allMarketplaces.includes(m))
      : (enhanceOnly ? ["shopify"] : allMarketplaces);

    const normalizedBusiness = {
      name: clampText(business.name, 80, "Unknown"),
      niche: clampText(business.niche, 80, "General"),
      tone: clampText(business.tone, 60, "Professional"),
      audience: clampText(business.audience, 80, "General shoppers"),
    };

    const normalizedProduct = {
      title: clampText(product.title, 140, "Untitled product"),
      description: clampText(product.description, 700),
      features: clampText(product.features, 500),
      category: clampText(product.category, 80, "General"),
      keywords: clampText(product.keywords, 220),
      price: clampText(product.price, 32),
    };

    const prompt = enhanceOnly
      ? `You are an expert e-commerce merchandiser. Improve only the missing product fields.

Business Context:
- Name: ${normalizedBusiness.name}
- Niche: ${normalizedBusiness.niche}
- Tone: ${normalizedBusiness.tone}
- Target Audience: ${normalizedBusiness.audience}

Product:
- Title: ${normalizedProduct.title}
- Description: ${normalizedProduct.description}
- Features: ${normalizedProduct.features}
- Category: ${normalizedProduct.category}
- Keywords: ${normalizedProduct.keywords}
- Price: ${normalizedProduct.price}

Return concise values for:
- description
- keywords
- category
- features

Rules:
- Plain text only
- Keep each field practical and brief
- Do not add markdown`
      : `You are an expert e-commerce copywriter and SEO specialist. Generate optimized product listings for each marketplace.

Business Context:
- Name: ${normalizedBusiness.name}
- Niche: ${normalizedBusiness.niche}
- Tone: ${normalizedBusiness.tone}
- Target Audience: ${normalizedBusiness.audience}

THE PRODUCT YOU ARE WRITING FOR:
>>> This product IS A "${normalizedProduct.category}". Nothing else. <<<
- Working title: ${normalizedProduct.title}
- Price: ${normalizedProduct.price}

DESIGN THEME / ARTWORK INSPIRATION (use ONLY for visual theme — NOT for product format):
- Theme description: ${normalizedProduct.description}
- Theme features: ${normalizedProduct.features}
- Theme keywords: ${normalizedProduct.keywords}

CRITICAL CATEGORY OVERRIDE RULES — READ CAREFULLY:
The "Theme description" and "Theme features" above may have been written for a DIFFERENT product format (e.g. a jar, mug, sticker, poster, candle, print). You MUST IGNORE the physical-format language and treat that text purely as artwork/design inspiration.

- The actual product is a "${normalizedProduct.category}". Every sentence you write must describe a "${normalizedProduct.category}" featuring that design theme.
- DO NOT use the words "jar", "mug", "candle", "sticker", "poster", "print", "decor", "home decor", "desk", "shelf", "collectible", "conversation starter", "glass", "cork stopper", or any other non-"${normalizedProduct.category}" format references — UNLESS the category itself IS that format.
- Rewrite the description from scratch as if you've never seen the old text. Translate the design theme into language appropriate for a "${normalizedProduct.category}" (e.g. for a T-Shirt: "graphic tee featuring a smiling Earth amongst cosmic swirls", "soft cotton shirt with celestial artwork").
- Bullet points must describe attributes of a "${normalizedProduct.category}" (fit, fabric, print quality, sizing for apparel; capacity, material for drinkware; etc.) — NOT attributes of the original source format.
- Tags MUST include the category as a primary tag and combine it with theme tags. NEVER emit tags that imply a different product format.

Marketplace style:
- Etsy: creative title with tags, storytelling description with emojis, handmade feel
- eBay: clear factual title, structured description, trust signals
- Shopify: clean brand-forward copy, lifestyle-oriented

IMPORTANT FORMATTING RULES:
- Descriptions must be PLAIN TEXT only — no markdown (no #, ##, ###, **, *, etc.)
- Use natural paragraph breaks for readability
- Bullet points go in the bulletPoints array, NOT in the description field
${excludedSections?.length ? `
CONTENT EXCLUSIONS — DO NOT include any of the following topics in the description or bullet points:
${(excludedSections as string[]).includes("materials") ? "- Materials, fabric composition, garment specs, fit details, sizing info (the storefront displays these separately)\n" : ""}${(excludedSections as string[]).includes("care") ? "- Care instructions, washing/drying/ironing guidance (the storefront displays these separately)\n" : ""}${(excludedSections as string[]).includes("shipping") ? "- Shipping times, delivery info, return policy, refund details (the storefront displays these separately)\n" : ""}Focus ONLY on the product story, lifestyle benefits, and brand voice.
` : ""}
For EACH marketplace listing, also generate:
- title: REWRITE the title so it clearly names the "${normalizedProduct.category}" (e.g. "Cosmic Earth Graphic T-Shirt" — not "The Universe Jar")
- seoTitle: An SEO meta title (under 60 chars, with primary keyword + category word)
- seoDescription: An SEO meta description (under 160 chars, mentions the category, with CTA)
- urlHandle: A clean URL slug (lowercase, hyphens, includes the category, e.g. "cosmic-earth-t-shirt")
- altText: Descriptive alt text mentioning the "${normalizedProduct.category}" and the design theme`;

    const listingSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        bulletPoints: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
        seoTitle: { type: "string", description: "SEO meta title under 60 chars" },
        seoDescription: { type: "string", description: "SEO meta description under 160 chars" },
        urlHandle: { type: "string", description: "URL-safe slug like lavender-soy-candle" },
        altText: { type: "string", description: "Image alt text for accessibility" },
      },
      required: ["title", "description", "bulletPoints", "tags", "seoTitle", "seoDescription", "urlHandle", "altText"],
    };

    // ---------- Enhance-only branch (single AI call) ----------
    if (enhanceOnly) {
      const responseSchema = {
        type: "object",
        properties: {
          enhanced: {
            type: "object",
            properties: {
              description: { type: "string" },
              keywords: { type: "string" },
              category: { type: "string" },
              features: { type: "string" },
            },
            required: ["description", "keywords", "category", "features"],
          },
        },
        required: ["enhanced"],
        additionalProperties: false,
      };
      const result = await callAi({
        systemPrompt: "You improve product fields for e-commerce. You MUST call the enhance_product function with concise plain-text output.",
        userPrompt: prompt,
        toolName: "enhance_product",
        toolDescription: "Improve missing product fields with concise plain-text output",
        schema: responseSchema,
      });
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- Listings branch: ONE AI call per marketplace, in parallel ----------
    const marketplaceStyle: Record<string, string> = {
      etsy: "Etsy: creative title with tags, storytelling description with emojis, handmade feel.",
      ebay: "eBay: clear factual title, structured description, trust signals.",
      shopify: "Shopify: clean brand-forward copy, lifestyle-oriented.",
    };

    const settled = await Promise.allSettled(
      marketplaces.map(async (m: string) => {
        const perMarketplacePrompt = `${prompt}\n\nGenerate the listing ONLY for: ${m}.\nMarketplace style: ${marketplaceStyle[m] || ""}`;
        let lastErr: unknown;
        for (let attempt = 0; attempt < AI_RETRY_ATTEMPTS; attempt++) {
          try {
            const result = await callAi({
              systemPrompt: "You are an expert e-commerce SEO copywriter. You MUST call the generate_listing function with your output.",
              userPrompt: perMarketplacePrompt,
              toolName: "generate_listing",
              toolDescription: `Generate one ${m} listing with SEO metadata`,
              schema: listingSchema,
            });
            return [m, result] as const;
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            // Don't retry on 429/402/non-transient errors
            if (msg.includes("Rate limit") || msg.includes("credits exhausted")) break;
          }
        }
        throw lastErr;
      })
    );

    const merged: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled") {
        const [m, listing] = r.value;
        merged[m] = listing;
      } else {
        errors.push(String(r.reason?.message || r.reason));
      }
    }
    if (Object.keys(merged).length === 0) {
      const msg = errors[0] || "All marketplace generations failed";
      const isTimeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("abort");
      return new Response(JSON.stringify({ error: isTimeout ? "Listing generation timed out. Please retry." : msg }), {
        status: isTimeout ? 504 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(merged), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || e.message.includes("timeout"))) {
      return new Response(JSON.stringify({ error: "Listing generation timed out. Please retry with fewer marketplaces." }), {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("generate-listings error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ---------- Helper: single AI call with tool-forced JSON ----------
async function callAi(opts: {
  systemPrompt: string;
  userPrompt: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
}): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("AI gateway timeout"), AI_REQUEST_TIMEOUT_MS);

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
        temperature: 0.4,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: opts.toolName,
            description: opts.toolDescription,
            parameters: opts.schema,
          },
        }],
        tool_choice: { type: "function", function: { name: opts.toolName } },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 429) throw new Error("Rate limit exceeded. Please try again in a moment.");
    if (status === 402) throw new Error("AI credits exhausted. Please add credits to continue.");
    const t = await response.text();
    console.error("AI gateway error:", status, t);
    throw new Error(`AI gateway error: ${status}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("No tool call in response");
  return JSON.parse(toolCall.function.arguments);
}
