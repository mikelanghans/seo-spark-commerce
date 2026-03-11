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

THINK OF THIS AS TWO SEPARATE LAYERS:
LAYER 1 (bottom): The plain ${colorName} t-shirt fabric with NO design — just blank fabric.
LAYER 2 (top): The design printed ON TOP using thick, opaque screen-print ink that completely covers the fabric beneath it.

The ink is a PHYSICAL LAYER sitting ON TOP of the fabric:
- ALL white elements = thick opaque white ink = PURE #FFFFFF, as bright as a sheet of white printer paper
- ALL colored elements (teal, cyan, orange, etc.) = thick opaque colored ink = FULLY SATURATED vivid colors
- The ink does NOT absorb into the fabric. It does NOT become transparent. It does NOT take on the fabric color.
- Imagine white paint splashed on a dark wall — the white stays pure white.

CRITICAL MISTAKES TO AVOID:
❌ Making white text look gray, cream, beige, or muted — WRONG
❌ Making the design look like it's dyed into the fabric — WRONG
❌ Reducing opacity or blending the design with the shirt color — WRONG
❌ Making colored accents look washed out or desaturated — WRONG

✅ The design must look like a bright, crisp sticker placed on top of the fabric
✅ Maximum contrast between bright white ink and dark ${colorName} fabric
✅ The white must be eye-catchingly bright — unnaturally so if needed`;

    const hasDesignRef = !!designImageBase64;
    const prompt = hasDesignRef
      ? `TASK: Change ONLY the t-shirt fabric color to ${colorName}. Everything else must be PIXEL-PERFECT identical.

You receive two images:
1. The reference mockup photo — clone this EXACTLY, only recolor the fabric
2. The original design graphic — this is what's printed on the shirt

ABSOLUTE RULES:
- Copy the EXACT same photo: same angle, lighting, background, wrinkles, shadows, folding
- The printed design must be IDENTICAL: same text (letter-for-letter), same graphics, same fonts, same size, same position
- Do NOT redesign, reinterpret, or regenerate the design — just change the fabric color underneath it
- Think of this as a Photoshop "Hue/Saturation" adjustment on ONLY the fabric pixels

${printColorRule}

Product: ${productTitle}. The result must look like the same photo with a color filter applied to just the shirt fabric.`
      : `TASK: Change ONLY the t-shirt fabric color to ${colorName}. Everything else must be PIXEL-PERFECT identical.

ABSOLUTE RULES:
- Copy the EXACT same photo: same angle, lighting, background, wrinkles, shadows, folding
- The printed design must be IDENTICAL: same text (letter-for-letter), same graphics, same fonts, same size, same position
- Do NOT redesign, reinterpret, or regenerate the design — just change the fabric color underneath it
- Think of this as a Photoshop "Hue/Saturation" adjustment on ONLY the fabric pixels

${printColorRule}

Product: ${productTitle}. The result must look like the same photo with a color filter applied to just the shirt fabric.`;

    const imageContent: any[] = [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: imageBase64 } },
    ];
    if (designImageBase64) {
      imageContent.push({ type: "image_url", image_url: { url: designImageBase64 } });
    }

    // gemini-2.5-flash-image is best for controlled edits (recoloring)
    // Fall back to newer models if unavailable
    const models = [
      "google/gemini-2.5-flash-image",
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
