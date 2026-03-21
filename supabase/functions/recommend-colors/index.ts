import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { productTitle, productCategory, brandName, brandNiche, brandAudience, brandTone, existingColors, designImageBase64 } = await req.json();

    const prompt = `You are a fashion merchandising expert specializing in print-on-demand apparel color strategy.

PRODUCT: "${productTitle}"
CATEGORY: ${productCategory || "T-Shirt"}
BRAND: ${brandName || "lifestyle apparel"}
NICHE: ${brandNiche || "lifestyle"}
TARGET AUDIENCE: ${brandAudience || "general"}
TONE: ${brandTone || "modern"}

${existingColors?.length ? `ALREADY GENERATED COLORS (do NOT recommend these): ${existingColors.join(", ")}` : ""}

${designImageBase64 ? "I've attached the actual design graphic. ANALYZE IT CAREFULLY — consider its colors, mood, theme, and visual elements when recommending garment colors. Choose colors that complement or contrast the design's palette for maximum visual impact." : ""}

AVAILABLE COLORS (Comfort Colors 1717 palette — ONLY recommend from this list):
Black, White, True Navy, Red, Moss, Grey, Blue Jean, Pepper, Island Green, Ivory, Crimson, Espresso, Midnight, Sage, Chambray

IMPORTANT RULES:
1. You MUST always include "Black" and "White" in your recommendations (unless they are in the already-generated list).
2. Recommend a total of 6-8 colors (including Black and White).
3. Black and White are mandatory because every design is produced in both light-ink and dark-ink versions.

For each color beyond Black and White, recommend those that would:
1. Best complement or contrast the SPECIFIC design's color palette and visual theme
2. Create strong visual impact — the garment color should make this particular design pop
3. Cover the most popular color preferences for the niche
4. Maximize conversion rates based on POD industry data

For each color, provide a brief reason specific to THIS design (reference its colors, theme, or elements — not generic reasons).`;

    // Build message content — include design image if available
    const userContent: any[] = [{ type: "text", text: prompt }];
    if (designImageBase64) {
      userContent.push({ type: "image_url", image_url: { url: designImageBase64 } });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a merchandising expert. You MUST call the recommend_colors function. Always include Black and White. Return 6-8 total colors. When a design image is provided, your recommendations MUST be specifically tailored to that design's visual characteristics." },
          { role: "user", content: designImageBase64 ? userContent : prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "recommend_colors",
              description: "Return recommended colors with reasoning. Must include Black and White. Return 6-8 total.",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        color: { type: "string", description: "Exact color name from the available palette" },
                        reason: { type: "string", description: "Brief reason referencing the specific design (max 15 words)" },
                      },
                      required: ["color", "reason"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["recommendations"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "recommend_colors" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
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

    const result = JSON.parse(toolCall.function.arguments);
    let recs: { color: string; reason: string }[] = result.recommendations || [];

    // Ensure Black and White are always present
    const existingSet = new Set((existingColors || []).map((c: string) => c.toLowerCase()));
    const recColors = new Set(recs.map((r) => r.color.toLowerCase()));

    if (!recColors.has("black") && !existingSet.has("black")) {
      recs.unshift({ color: "Black", reason: "Essential base — every design needs a dark foundation" });
    }
    if (!recColors.has("white") && !existingSet.has("white")) {
      recs.splice(1, 0, { color: "White", reason: "Essential base — clean contrast for dark-ink designs" });
    }

    // Cap at 8
    recs = recs.slice(0, 8);

    return new Response(JSON.stringify({ recommendations: recs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("recommend-colors error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
