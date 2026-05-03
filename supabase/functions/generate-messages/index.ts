import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deductCredits, insufficientCreditsResponse } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL_FALLBACKS = [
  "google/gemini-2.5-flash-lite",
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
];

const MAX_EXISTING_PRODUCTS = 25;
const MAX_EXISTING_PRODUCT_LENGTH = 90;
const MAX_BATCH_SIZE = 10;

const cleanString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const compactExistingProducts = (existingProducts: unknown): string[] => {
  if (!Array.isArray(existingProducts)) return [];

  const seen = new Set<string>();
  const compact: string[] = [];

  for (const item of existingProducts) {
    const text = cleanString(item);
    if (!text) continue;

    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    compact.push(text.slice(0, MAX_EXISTING_PRODUCT_LENGTH));

    if (compact.length >= MAX_EXISTING_PRODUCTS) break;
  }

  return compact;
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Credit pre-check
    const creditOk = await deductCredits(user.id, "generate-messages");
    if (!creditOk) return insufficientCreditsResponse("generate-messages");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const payload = await req.json();
    const organization = payload?.organization;

    if (!organization?.id || !organization?.name) {
      return new Response(JSON.stringify({ error: "organization.id and organization.name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const countRaw = Number(payload?.count ?? 10);
    const batchSize = Number.isFinite(countRaw)
      ? Math.max(1, Math.min(MAX_BATCH_SIZE, Math.floor(countRaw)))
      : 10;

    const refineOriginal = cleanString(payload?.refineOriginal);
    const refineFeedback = cleanString(payload?.refineFeedback);
    const topic = cleanString(payload?.topic);
    const designStyle = cleanString(payload?.designStyle);
    const existingProducts = compactExistingProducts(payload?.existingProducts);

    const isRefine = !!refineOriginal && !!refineFeedback;

    // Build feedback context from ACTUAL user selection behavior
    const userId = user.id;
    let feedbackContext = "";
    if (organization.id) {
      const { data: roleCheck } = await supabase.rpc("get_org_role", { _user_id: userId, _org_id: organization.id });
      if (!roleCheck) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // 1) Selected messages = strong positive signal (user kept these)
      const { data: selectedMsgs } = await serviceClient
        .from("generated_messages")
        .select("message_text")
        .eq("organization_id", organization.id)
        .eq("is_selected", true)
        .order("created_at", { ascending: false })
        .limit(15);

      // 1b) Messages that made it to design = strongest signal (user invested in these)
      const { data: designedMsgs } = await serviceClient
        .from("generated_messages")
        .select("message_text")
        .eq("organization_id", organization.id)
        .not("design_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(10);

      // 2) Recent unselected messages = negative signal (user skipped these)
      const { data: skippedMsgs } = await serviceClient
        .from("generated_messages")
        .select("message_text")
        .eq("organization_id", organization.id)
        .eq("is_selected", false)
        .is("product_id", null)
        .order("created_at", { ascending: false })
        .limit(10);

      // 3) Top product titles = proven commercial winners
      const { data: topProducts } = await serviceClient
        .from("products")
        .select("title")
        .eq("organization_id", organization.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false })
        .limit(10);

      const selectedTexts = (selectedMsgs || []).map((m: any) => m.message_text).filter(Boolean);
      const designedTexts = (designedMsgs || []).map((m: any) => m.message_text).filter(Boolean);
      const skippedTexts = (skippedMsgs || []).map((m: any) => m.message_text).filter(Boolean);
      const productTitles = (topProducts || []).map((p: any) => p.title).filter(Boolean);

      // Designed messages are the strongest signal — user actually turned these into products
      if (designedTexts.length > 0) {
        feedbackContext += `\n\nMESSAGES THAT BECAME ACTUAL DESIGNS (highest priority — match this quality and style):\n${designedTexts.map(t => `- "${t}"`).join("\n")}`;
      }
      if (selectedTexts.length > 0) {
        feedbackContext += `\n\nMESSAGES THE USER LOVED (generate MORE like these in style, tone, and energy):\n${selectedTexts.map(t => `- "${t}"`).join("\n")}`;
      }
      if (skippedTexts.length > 0) {
        feedbackContext += `\n\nMESSAGES THE USER SKIPPED (AVOID this style/tone):\n${skippedTexts.map(t => `- "${t}"`).join("\n")}`;
      }
      if (productTitles.length > 0) {
        feedbackContext += `\n\nEXISTING BEST-SELLING PRODUCTS (for thematic alignment):\n${productTitles.map(t => `- "${t}"`).join("\n")}`;
      }

      // 4) Also pull design feedback notes if any exist
      const { data: feedback } = await serviceClient
        .from("design_feedback")
        .select("rating, notes")
        .eq("organization_id", organization.id)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (feedback && feedback.length > 0) {
        const likedNotes = feedback.filter((f: any) => f.rating === "up" && f.notes).map((f: any) => f.notes);
        const dislikedNotes = feedback.filter((f: any) => f.rating === "down" && f.notes).map((f: any) => f.notes);
        if (likedNotes.length > 0) feedbackContext += `\nDesign elements user liked: ${likedNotes.join("; ")}`;
        if (dislikedNotes.length > 0) feedbackContext += `\nDesign elements user disliked: ${dislikedNotes.join("; ")}`;
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

ORIGINAL MESSAGE: "${refineOriginal}"
USER FEEDBACK: "${refineFeedback}"

Generate exactly 3 refined variations. Each variation should:
- Address the feedback while keeping the core idea
- Stay short for apparel (2-12 words)
- Match brand tone
- Be meaningfully distinct`;
    } else {
      const isMinimalist = designStyle === "minimalist";
      const isYouniverses = String(organization.name || "").toLowerCase().includes("youniverse");

      const styleDirective = isMinimalist
        ? `\nSTYLE: MINIMALIST ILLUSTRATION\nMessages should pair with simple icons/line art and work as short supporting text.`
        : `\nSTYLE: TEXT-ONLY TYPOGRAPHY\nMessages must stand alone as strong typographic statements.`;

      const brandRule = isYouniverses
        ? `\nCRITICAL BRAND RULE FOR YOUNIVERSES:
- The brand voice is SARCASTIC, LIGHTHEARTED, and FUN — like a witty friend who says what everyone's thinking.
- Only SHORT punchy phrases (2-5 words) should end with " — the universe" (e.g. "Can you not — the universe", "Oh, we're improvising now — the universe").
- Longer messages (6+ words) should NOT have "— the universe" — they stand alone.
- Think dry humor, relatable chaos, gentle roasts, and playful sarcasm.
- Avoid inspirational, motivational, or earnest tones — lean into irreverence.`
        : "";

      let existingProductsContext = "";
      if (existingProducts.length > 0) {
        const productList = existingProducts.map((t) => `- "${t}"`).join("\n");
        existingProductsContext = `\nDUPLICATE AVOIDANCE:\nDo not generate the same or very similar messages as:\n${productList}\n`;
      }

      prompt = `You are a creative copywriter and trend analyst for "${organization.name}".
${topic ? `\nTOPIC: "${topic}". Every message must relate to this topic.` : ""}
${styleDirective}
${brandRule}
${existingProductsContext}
Brand context:
- Niche: ${organization.niche}
- Tone: ${organization.tone}
- Target Audience: ${organization.audience}
${feedbackContext}

Generate exactly ${batchSize} short, punchy messages for POD products.
Requirements:
- 2-8 words ideal, max 12
- High commercial appeal and shareability
- Distinct from each other
- Match brand voice exactly
- ${isMinimalist ? "Suitable for icon + phrase compositions" : "Strong as pure typography"}`;
    }

    let lastError: Error | null = null;

    for (const model of MODEL_FALLBACKS) {
      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are a creative copywriter. You MUST call the generate_messages function with your output.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.8,
            max_tokens: 700,
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
                            text: {
                              type: "string",
                              description: "The message text for the product",
                            },
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
          const bodyText = await response.text();

          if (status === 429) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (status === 402) {
            return new Response(JSON.stringify({ error: "AI service is temporarily unavailable. Please try again shortly." }), {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const retryable = status === 404 || status === 410 || status >= 500;
          const modelError = new Error(`Model ${model} failed (${status}): ${bodyText.slice(0, 500)}`);

          if (retryable) {
            lastError = modelError;
            continue;
          }

          throw modelError;
        }

        const data = await response.json();
        const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];

        if (!toolCall?.function?.arguments) {
          lastError = new Error(`Model ${model} returned no tool call`);
          continue;
        }

        const result = JSON.parse(toolCall.function.arguments);
        const messages = Array.isArray(result?.messages) ? result.messages : [];

        if (messages.length === 0) {
          lastError = new Error(`Model ${model} returned empty messages`);
          continue;
        }

        return new Response(JSON.stringify({ messages }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
    }

    throw lastError || new Error("All AI model attempts failed");
  } catch (e) {
    console.error("generate-messages error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});