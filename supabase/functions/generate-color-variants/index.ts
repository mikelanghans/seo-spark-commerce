import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, colorName, productTitle, designImageBase64 } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Detect if this is a light-colored shirt where white/light ink won't be visible
    const LIGHT_COLORS = new Set([
      "ivory", "butter", "banana", "blossom", "orchid", "chalky mint",
      "island reef", "chambray", "white", "flo blue", "watermelon",
      "neon pink", "neon green", "lagoon blue", "yam", "terracotta",
      "light green", "bay", "sage",
    ]);
    const isLightShirt = LIGHT_COLORS.has((colorName || "").toLowerCase().trim());

    const printColorRule = isLightShirt
      ? `⚠️ PRINT COLOR RULE — CRITICAL FOR LIGHT SHIRTS:
- The original design uses white/light colored ink which would be INVISIBLE on a ${colorName} shirt.
- You MUST change the design's ink color to DARK BLACK/CHARCOAL so it is clearly visible on the light ${colorName} fabric.
- Keep everything else about the design identical: same text, same fonts, same graphics, same layout, same size, same position.
- ONLY the ink/print color changes from white/light to dark black. The design content stays exactly the same.
- The dark design must be crisp, bold, and fully legible against the ${colorName} fabric.`
      : `⚠️ PRINT COLOR RULE — THE SINGLE MOST IMPORTANT RULE IN THIS ENTIRE PROMPT:
- Look at image 2 (the design file). It has WHITE text and graphics on a transparent background.
- In your output mockup, the text and graphics MUST be rendered as PURE BRIGHT WHITE (#FFFFFF) — maximum brightness, maximum contrast against the dark ${colorName} fabric.
- This is screen-printed DTG white ink. It is FULLY OPAQUE. It does NOT blend with the fabric. It does NOT become gray, cream, beige, tan, or any muted tone.
- Think of it like painting pure white paint on a dark wall — the white stays white.
- If the design has colored elements (like teal, cyan, orange accents), those must also stay VIVID and SATURATED — do not mute or desaturate any print colors.
- COMMON MISTAKE TO AVOID: Making the white text look "natural" or "blended" — that is WRONG. The ink must look bold, crisp, and unnaturally bright white against the fabric.
- The design must POP off the shirt with strong contrast.`;

    const hasDesignRef = !!designImageBase64;
    const prompt = hasDesignRef
      ? `You are given two images:
1. A REFERENCE product mockup photo — you must CLONE this photo exactly, only changing the shirt color
2. The original design/graphic printed on the shirt

YOUR TASK: Create an IDENTICAL copy of image 1 but with the t-shirt fabric color changed to ${colorName}.

THIS IS A RECOLORING TASK, NOT A REDESIGN TASK.

CRITICAL — WHAT MUST BE IDENTICAL TO IMAGE 1:
- The EXACT same text, letter-for-letter, word-for-word — read image 1 carefully and reproduce every word exactly
- The EXACT same font, font size, font weight, letter spacing, and text layout
- The EXACT same graphic/illustration elements in the same positions
- The EXACT same design size relative to the shirt — same coverage area, same proportions
- The EXACT same design position on the shirt
- The EXACT same camera angle, distance, perspective, framing
- The EXACT same background scene, surface texture, lighting direction, shadows
- The EXACT same t-shirt folding style, lay position, wrinkles, and props

WHAT CHANGES:
- ONLY the t-shirt fabric color → ${colorName}
${isLightShirt ? "- The design ink color changes from white/light to DARK BLACK (see print color rule below)" : ""}

${printColorRule}

Product: ${productTitle}. The output must be a near-identical clone of image 1 with only the fabric color changed.`
      : `Create an IDENTICAL copy of this product mockup photo but change ONLY the t-shirt fabric color to ${colorName}.

THIS IS A RECOLORING TASK, NOT A REDESIGN TASK.

CRITICAL — WHAT MUST STAY IDENTICAL:
- The EXACT same text on the shirt, letter-for-letter, word-for-word
- The EXACT same font, size, weight, spacing, and layout
- The EXACT same graphic elements in the same positions
- The EXACT same design size and position on the shirt
- The EXACT same camera angle, perspective, framing, background, lighting, shadows
- The EXACT same t-shirt fold, lay position, wrinkles, and props

WHAT CHANGES:
- ONLY the fabric color → ${colorName}
${isLightShirt ? "- The design ink color changes from white/light to DARK BLACK (see print color rule below)" : ""}

${printColorRule}

Product: ${productTitle}. Output must be a near-identical clone with only the fabric color changed.`;

    const imageContent: any[] = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageBase64 } },
    ];
    if (designImageBase64) {
      imageContent.push({ type: "image_url", image_url: { url: designImageBase64 } });
    }

    const models = [
      "google/gemini-3.1-flash-image-preview",
      "google/gemini-3-pro-image-preview",
    ];

    let response: Response | null = null;
    let lastError = "";

    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));

        response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: imageContent,
              },
            ],
            modalities: ["image", "text"],
          }),
        });

        if (response.ok) break;
        if (response.status === 503 || response.status === 500) {
          lastError = `${model} returned ${response.status}`;
          console.error(`Attempt ${attempt + 1} with ${model}: ${response.status}`);
          response = null;
          continue;
        }
        // Non-retryable errors
        break;
      }
      if (response?.ok) break;
    }

    if (!response || !response.ok) {
      const status = response?.status;
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
      const t = response ? await response.text() : lastError;
      console.error("AI gateway error:", status, t);
      throw new Error(`AI gateway error: ${status || "all models unavailable"}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    // Check for images array (new format)
    let imageBase64Result: string | null = null;

    if (message?.images?.length > 0) {
      imageBase64Result = message.images[0].image_url?.url || null;
    }

    // Fallback: check content array
    if (!imageBase64Result && Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part.type === "image_url" && part.image_url?.url) {
          imageBase64Result = part.image_url.url;
          break;
        }
        if (part.inline_data) {
          imageBase64Result = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
          break;
        }
      }
    }

    // Fallback: string content
    if (!imageBase64Result && typeof message?.content === "string" && message.content.startsWith("data:image")) {
      imageBase64Result = message.content;
    }

    if (!imageBase64Result) {
      console.error("Unexpected response structure:", JSON.stringify(data).substring(0, 500));
      throw new Error("No image generated from AI response");
    }

    return new Response(JSON.stringify({ imageBase64: imageBase64Result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-color-variants error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
