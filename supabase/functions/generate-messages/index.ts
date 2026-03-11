import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { organization, count, refineOriginal, refineFeedback, topic, designStyle, existingProducts } = await req.json();
    const batchSize = count || 10;
    const isRefine = !!refineOriginal && !!refineFeedback;

    // Fetch past design feedback to inform message generation
    const userId = claimsData.claims.sub as string;
    let feedbackContext = "";
    if (organization.id) {
      const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: feedback } = await serviceClient
        .from("design_feedback")
        .select("rating, notes")
        .eq("organization_id", organization.id)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (feedback && feedback.length > 0) {
        const liked = feedback.filter((f: any) => f.rating === "up" && f.notes).map((f: any) => f.notes);
        const disliked = feedback.filter((f: any) => f.rating === "down" && f.notes).map((f: any) => f.notes);
        if (liked.length > 0) feedbackContext += `\nThe user LIKED these past design elements: ${liked.join("; ")}`;
        if (disliked.length > 0) feedbackContext += `\nThe user DISLIKED these past design elements: ${disliked.join("; ")}`;
      }
    }

    let prompt: string;

    if (isRefine) {
      prompt = `You are a creative copywriter for "${organization.name}".

Brand context:
- Niche: ${organization.niche}
- Tone: ${organization.tone}
- Target Audience: ${organization.audience}
${feedbackContext}

The user has an existing t-shirt message that's close but needs refinement:

ORIGINAL MESSAGE: "${refineOriginal}"

USER FEEDBACK: "${refineFeedback}"

Generate exactly 3 refined variations of this message based on the feedback. Each variation should:
- Address the user's feedback while keeping the core idea
- Stay short enough for a t-shirt (2-12 words)
- Match the brand tone
- Be distinct from each other — give meaningfully different takes`;
    } else {
      const isMinimalist = designStyle === "minimalist";
      const isYouniverses = organization.name?.toLowerCase().includes("youniverse");
      const styleDirective = isMinimalist
        ? `\n🎨 DESIGN STYLE: MINIMALIST ILLUSTRATION
These messages will be paired with minimalist artwork/illustrations. Generate messages that:
- Work alongside a visual element (icon, illustration, or symbol)
- Can be shorter since the illustration carries meaning too
- Evoke imagery — animals, objects, nature, abstract concepts
- Think: a simple line drawing of a cat + "nope" or a wilting flower + "still growing"
- The message + illustration together should tell a complete story\n`
        : `\n🎨 DESIGN STYLE: TEXT-ONLY TYPOGRAPHY
These messages will be pure typography designs — no illustrations. Generate messages that:
- Stand on their own visually as bold text
- Sound powerful when read aloud — the words ARE the design
${isYouniverses
  ? `

⚠️ CRITICAL BRAND RULE — READ CAREFULLY:
Every single message MUST follow this EXACT format: "[short phrase] — the universe"
The phrase before " — the universe" must be 2-5 words. Shorter is always better.
DO NOT use {BRACKETS}, long sentences, periods mid-message, or parentheticals.

GOOD examples:
- "you got this — the universe"
- "plot twist — the universe"  
- "trust the timing — the universe"
- "breathe — the universe"
- "it's happening — the universe"
- "keep going — the universe"
- "not yet — the universe"

BAD examples (DO NOT generate these):
- "{ORBITING} but not quite reaching the point" ← WRONG, no brackets, no long text
- "DON'T PANIC. Everything is temporary." ← WRONG, missing "— the universe"
- "YOU ARE HERE. (Unfortunately) — The Universe" ← WRONG, too long, has parenthetical

`
  : `- Have natural typographic hierarchy (big word + small attribution works great)
- Work in formats like {BRACKETS}, "quotes — attribution", or standalone bold statements`}
- Think: the kind of text you'd see on a premium streetwear tee\n`;

      // Build existing products exclusion list
      let existingProductsContext = "";
      if (existingProducts && existingProducts.length > 0) {
        const productList = existingProducts.slice(0, 100).map((t: string) => `- "${t}"`).join("\n");
        existingProductsContext = `\n⚠️ DUPLICATE AVOIDANCE — CRITICAL:
The brand already has the following products. DO NOT generate messages that are the same as, or very similar to, any of these existing products. Each new message must be clearly distinct:
${productList}\n`;
      }

      prompt = `You are a creative copywriter AND trend analyst for "${organization.name}".

${topic ? `🎯 TOPIC/THEME: "${topic}" — ALL messages MUST be themed around this topic. Every single message should relate to "${topic}" while staying on-brand.\n` : ""}${styleDirective}${existingProductsContext}
Brand context:
- Niche: ${organization.niche}
- Tone: ${organization.tone}
- Target Audience: ${organization.audience}
${feedbackContext}

TREND & BEST-SELLING ANALYSIS:
Before generating messages, apply your knowledge of what sells well in the print-on-demand (POD) industry:

1. TOP-SELLING POD MESSAGE CATEGORIES (prioritize these):
   - Self-deprecating humor about adulting, burnout, overthinking, anxiety
   - Sarcastic motivational quotes that subvert toxic positivity
   - Niche identity statements ("I'm not lazy, I'm on energy-saving mode")
   - Minimalist one-word or two-word statements with strong typography potential ({SIGH}, {NOPE}, {CHAOS})
   - Pop-culture-adjacent vibes without IP infringement
   - "Seen on TikTok/Instagram" relatable humor

2. DESIGN-FIRST THINKING:
   - ${isMinimalist ? "Messages that pair beautifully with a simple illustration or icon" : "Messages that look GREAT as minimalist typography (bold + thin font combos)"}
   - Short messages (2-5 words) consistently outsell longer ones
   - ${isMinimalist ? "Think about what visual would accompany each message" : "Messages with natural visual hierarchy (a bold word + a smaller attribution)"}
   - ${isMinimalist ? "The illustration should be obvious from the message context" : "Bracket/brace format {LIKE THIS} performs extremely well in the minimalist POD space"}

3. AUDIENCE PSYCHOLOGY:
   - Gen Z/Millennial buyers want to feel "seen" — messages should feel like an inside joke
   - Buyers purchase messages that express what they can't say out loud
   - The best sellers make people screenshot and share before they even buy

Generate exactly ${batchSize} short, punchy messages that could be printed on t-shirts, mugs, or stickers. Each message should be:
- Perfectly aligned with the "${organization.name}" brand identity, niche ("${organization.niche}"), and target audience ("${organization.audience}")
- Written in the brand's tone: "${organization.tone}"
- Short enough for a t-shirt print (ideally 2-8 words, max 12 words)
- Memorable, quotable, and slightly irreverent
- ${isMinimalist ? "Designed to pair with a simple minimalist illustration" : "Mix of formats: some with {curly braces}, some with attributions, some standalone"}
- Optimized for SELLING — think about what someone would actually pay $29 to wear

Make each one distinct in style and energy. Some funny, some surprisingly deep, some deadpan. Prioritize messages that have the highest commercial potential based on current POD trends and that authentically represent the "${organization.name}" brand.`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a creative copywriter. You MUST call the generate_messages function with your output." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_messages",
              description: "Return an array of generated t-shirt messages",
              parameters: {
                type: "object",
                properties: {
                  messages: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        text: { type: "string", description: "The message text for the product" },
                      },
                      required: ["text"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["messages"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_messages" } },
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

    return new Response(JSON.stringify({ messages: result.messages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-messages error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
