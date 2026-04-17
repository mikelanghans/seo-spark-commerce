import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserIdFromAuth, deductCredits, insufficientCreditsResponse } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_REQUEST_TIMEOUT_MS = 55000;

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

Product:
- Title: ${normalizedProduct.title}
- Description: ${normalizedProduct.description}
- Features: ${normalizedProduct.features}
- Category: ${normalizedProduct.category}
- Keywords: ${normalizedProduct.keywords}
- Price: ${normalizedProduct.price}

Generate SEO-optimized listings for: ${marketplaces.join(", ")}. Only generate for these marketplaces.
Each listing must be tailored to that marketplace's style and SEO best practices.

CRITICAL — PRODUCT CATEGORY RULES:
- The product's actual category is "${normalizedProduct.category}". This is the ONLY product type. Treat it as the source of truth.
- Tags, titles, bullet points, and descriptions MUST describe a "${normalizedProduct.category}" — NOT any other format, object, or product type.
- If the description, features, or keywords reference a different physical product (e.g. a jar, mug, sticker, poster, candle), IGNORE those references. Re-interpret the design/theme as it would apply to a "${normalizedProduct.category}".
- Tags must include the product category itself (e.g. "t-shirt", "tee", "shirt" if the category is T-Shirt) and other tags relevant ONLY to that category. Never tag with unrelated product formats.
- Example: if category is "T-Shirt" but old description mentioned "jar", generate t-shirt tags like "graphic tee", "cotton shirt", "unisex t-shirt" — NEVER "jar", "home decor", "collectible".

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
- seoTitle: An SEO meta title (under 60 chars, with primary keyword)
- seoDescription: An SEO meta description (under 160 chars, compelling with CTA)
- urlHandle: A clean URL slug (lowercase, hyphens, no special chars, e.g. "lavender-soy-candle-8oz")
- altText: Descriptive alt text for the product image (for accessibility and SEO)`;

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

    const responseSchema = enhanceOnly
      ? {
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
        }
      : {
          type: "object",
          properties: Object.fromEntries(marketplaces.map((m: string) => [m, listingSchema])),
          required: marketplaces,
          additionalProperties: false,
        };

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
          model: "google/gemini-2.5-flash-lite",
          temperature: 0.4,
          messages: [
            {
              role: "system",
              content: enhanceOnly
                ? "You improve product fields for e-commerce. You MUST call the enhance_product function with concise plain-text output."
                : "You are an expert e-commerce SEO copywriter. You MUST call the generate_listings function with your output.",
            },
            { role: "user", content: prompt }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: enhanceOnly ? "enhance_product" : "generate_listings",
                description: enhanceOnly
                  ? "Improve missing product fields with concise plain-text output"
                  : "Generate marketplace-optimized product listings with SEO metadata",
                parameters: responseSchema,
              },
            },
          ],
          tool_choice: { type: "function", function: { name: enhanceOnly ? "enhance_product" : "generate_listings" } },
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
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const listings = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(listings), {
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
