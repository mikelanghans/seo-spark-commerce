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

    const { productTitle, productCategory, brandName, brandNiche, brandAudience, brandTone, existingColors } = await req.json();

    const prompt = `You are a fashion merchandising expert specializing in print-on-demand apparel color strategy.

PRODUCT: "${productTitle}"
CATEGORY: ${productCategory || "T-Shirt"}
BRAND: ${brandName || "lifestyle apparel"}
NICHE: ${brandNiche || "lifestyle"}
TARGET AUDIENCE: ${brandAudience || "general"}
TONE: ${brandTone || "modern"}

${existingColors?.length ? `ALREADY GENERATED COLORS (do NOT recommend these): ${existingColors.join(", ")}` : ""}

AVAILABLE COLORS (Comfort Colors 1717 palette — ONLY recommend from this list):
Black, White, True Navy, Red, Moss, Grey, Blue Jean, Pepper, Island Green, Ivory, Crimson, Espresso, Midnight, Sage, Chambray

Recommend the TOP 5-8 colors that would:
1. Sell best for this specific product and target audience
2. Create strong visual contrast with the design text/graphics
3. Cover the most popular color preferences for the niche
4. Maximize conversion rates based on POD industry data

For each color, provide a brief reason why it's a good choice for this specific product.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a merchandising expert. You MUST call the recommend_colors function." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "recommend_colors",
              description: "Return recommended colors with reasoning",
              parameters: {
                type: "object",
                properties: {
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        color: { type: "string", description: "Exact color name from the available palette" },
                        reason: { type: "string", description: "Brief reason why this color works (max 15 words)" },
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

    return new Response(JSON.stringify({ recommendations: result.recommendations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("recommend-colors error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
