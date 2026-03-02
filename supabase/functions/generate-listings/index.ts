import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { business, product } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const marketplaces = ["amazon", "etsy", "ebay", "shopify"];
    const prompt = `You are an expert e-commerce copywriter and SEO specialist. Generate optimized product listings for each marketplace.

Business Context:
- Name: ${business.name}
- Niche: ${business.niche}
- Tone: ${business.tone}
- Target Audience: ${business.audience}

Product:
- Title: ${product.title}
- Description: ${product.description}
- Features: ${product.features}
- Category: ${product.category}
- Keywords: ${product.keywords}
- Price: ${product.price}

Generate SEO-optimized listings for: ${marketplaces.join(", ")}.
Each listing must be tailored to that marketplace's style and SEO best practices.
- Amazon: keyword-rich title, benefit-driven bullet points, A+ description
- Etsy: creative title with tags, storytelling description with emojis, handmade feel
- eBay: clear factual title, structured description, trust signals
- Shopify: clean brand-forward copy, markdown-friendly, lifestyle-oriented`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert e-commerce SEO copywriter. You MUST call the generate_listings function with your output." },
          { role: "user", content: prompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_listings",
              description: "Generate marketplace-optimized product listings",
              parameters: {
                type: "object",
                properties: {
                  amazon: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      bulletPoints: { type: "array", items: { type: "string" } },
                      tags: { type: "array", items: { type: "string" } }
                    },
                    required: ["title", "description", "bulletPoints", "tags"]
                  },
                  etsy: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      bulletPoints: { type: "array", items: { type: "string" } },
                      tags: { type: "array", items: { type: "string" } }
                    },
                    required: ["title", "description", "bulletPoints", "tags"]
                  },
                  ebay: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      bulletPoints: { type: "array", items: { type: "string" } },
                      tags: { type: "array", items: { type: "string" } }
                    },
                    required: ["title", "description", "bulletPoints", "tags"]
                  },
                  shopify: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      bulletPoints: { type: "array", items: { type: "string" } },
                      tags: { type: "array", items: { type: "string" } }
                    },
                    required: ["title", "description", "bulletPoints", "tags"]
                  }
                },
                required: ["amazon", "etsy", "ebay", "shopify"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_listings" } }
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
    console.error("generate-listings error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
