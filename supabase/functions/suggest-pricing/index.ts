import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserIdFromAuth, deductCredits, insufficientCreditsResponse } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { product, business } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const prompt = `You are an expert e-commerce pricing strategist for print-on-demand and physical products.

Analyze this product and suggest optimal pricing based on the market, category trends, and competitive positioning.

Business Context:
- Brand: ${business?.name || "Unknown"}
- Niche: ${business?.niche || "General"}
- Target Audience: ${business?.audience || "General consumers"}
- Tone: ${business?.tone || "Professional"}

Product:
- Title: ${product.title}
- Description: ${product.description || "N/A"}
- Category: ${product.category || "General"}
- Keywords: ${product.keywords || "N/A"}
- Current Price: ${product.price || "Not set"}
- Features: ${product.features || "N/A"}

Provide three pricing tiers (budget, mid-range, premium) with specific dollar amounts. For each tier, explain the positioning strategy — who it targets and why. Also provide a market analysis summary explaining the typical price range for this type of product in the current market.

Consider: print-on-demand base costs (typically $8-15 for t-shirts, $10-20 for hoodies), marketplace fees, and perceived value based on brand positioning.`;

    const pricingSchema = {
      type: "object",
      properties: {
        marketAnalysis: {
          type: "string",
          description: "2-3 sentence overview of market pricing for this product category",
        },
        typicalRange: {
          type: "object",
          properties: {
            low: { type: "number", description: "Low end of typical market price" },
            high: { type: "number", description: "High end of typical market price" },
          },
          required: ["low", "high"],
        },
        tiers: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string", enum: ["Budget", "Mid-Range", "Premium"] },
              price: { type: "number", description: "Suggested price in USD" },
              reasoning: { type: "string", description: "1-2 sentence explanation of this tier's strategy" },
              targetAudience: { type: "string", description: "Who this price point targets" },
              marginEstimate: { type: "number", description: "Estimated profit margin percentage assuming typical POD costs" },
            },
            required: ["label", "price", "reasoning", "targetAudience", "marginEstimate"],
          },
        },
        recommendedTier: {
          type: "string",
          enum: ["Budget", "Mid-Range", "Premium"],
          description: "Which tier best fits this brand's positioning",
        },
        recommendedReason: {
          type: "string",
          description: "Why this tier is recommended for this specific brand",
        },
      },
      required: ["marketAnalysis", "typicalRange", "tiers", "recommendedTier", "recommendedReason"],
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are an expert e-commerce pricing analyst. You MUST call the suggest_pricing function." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_pricing",
            description: "Suggest optimal product pricing with market analysis",
            parameters: pricingSchema,
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_pricing" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const pricing = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(pricing), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-pricing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
