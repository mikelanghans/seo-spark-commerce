import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getUserIdFromAuth, deductCredits, insufficientCreditsResponse } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Credit pre-check
    const userId = await getUserIdFromAuth(req);
    if (userId) {
      const ok = await deductCredits(userId, "generate-social-posts");
      if (!ok) return insufficientCreditsResponse("generate-social-posts");
    }

    const { business, product, platforms } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const allPlatforms = ["instagram", "tiktok", "x", "facebook"];
    const selectedPlatforms = (platforms && platforms.length > 0)
      ? platforms.filter((p: string) => allPlatforms.includes(p))
      : allPlatforms;

    const prompt = `You are an expert social media marketer and copywriter. Generate engaging social media posts for each platform.

Business Context:
- Brand: ${business.name}
- Niche: ${business.niche}
- Tone: ${business.tone}
- Target Audience: ${business.audience}

Product:
- Title: ${product.title}
- Description: ${product.description}
- Category: ${product.category}
- Price: ${product.price}
- Keywords: ${product.keywords}

Generate social media posts for: ${selectedPlatforms.join(", ")}. Only generate for these platforms.

Platform guidelines:
- Instagram: Engaging caption with line breaks, emojis, call-to-action. 20-30 relevant hashtags including mix of popular and niche tags.
- TikTok: Short punchy hook, trending language, casual/authentic tone. 5-8 viral hashtags.
- X (Twitter): Concise under 280 chars, witty/clever, conversation-starting. 3-5 hashtags max.
- Facebook: Conversational, community-focused, slightly longer form. 5-10 hashtags.

Each post must feel native to its platform. Hashtags should be platform-appropriate and include a mix of broad reach and niche-specific tags.`;

    const postSchema = {
      type: "object",
      properties: {
        caption: { type: "string", description: "The full post caption/text" },
        hashtags: { type: "array", items: { type: "string" }, description: "Array of hashtags without # symbol" },
      },
      required: ["caption", "hashtags"],
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
          { role: "system", content: "You are an expert social media marketer. You MUST call the generate_social_posts function with your output." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_social_posts",
              description: "Generate platform-optimized social media posts with hashtags",
              parameters: {
                type: "object",
                properties: Object.fromEntries(selectedPlatforms.map((p: string) => [p, postSchema])),
                required: selectedPlatforms,
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_social_posts" } },
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

    const posts = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(posts), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-social-posts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
