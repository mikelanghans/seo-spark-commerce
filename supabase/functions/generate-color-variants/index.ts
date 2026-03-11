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

    const hasDesignRef = !!designImageBase64;
    const prompt = hasDesignRef
      ? `You are given two images:
1. A product mockup photo of a t-shirt — THIS IS YOUR STYLE REFERENCE
2. The original design/graphic that should be printed on the shirt

YOUR TASK: Generate a product mockup photo of a ${colorName} colored t-shirt with the design from image 2 printed on the UPPER CHEST area (not dead center — position it in the upper third of the shirt front, like a typical chest print).

CRITICAL RULES — follow ALL of these precisely:
1. The t-shirt fabric color MUST be ${colorName}
2. Place the design from image 2 centered on the front of the shirt
3. Preserve EVERY color in the printed design EXACTLY as shown in image 2 — do NOT alter any design colors to match the shirt
4. If the design has white elements, they stay white. If it has black elements, they stay black. Design colors are INDEPENDENT of shirt color.
5. MATCH the EXACT same camera angle, distance, perspective, and framing as image 1
6. MATCH the EXACT same background scene, surface/table texture, lighting direction, and shadows as image 1
7. MATCH the EXACT same t-shirt folding style, lay position, and any props visible in image 1
8. The design should be proportionally sized on the shirt front — EXACTLY the same size ratio as any design in image 1. DO NOT make the text or graphic larger or smaller than in the reference photo.
9. The output should look like it belongs in the SAME product photo set as image 1 — only the fabric color changes
10. TEXT SIZE CONSISTENCY IS CRITICAL: If image 1 shows text at a certain size relative to the shirt, your output MUST match that exact proportion. Do not enlarge or shrink the printed design between color variants.
Product: ${productTitle}. Output a high quality product photo that is visually consistent with the reference.`
      : `Take this product mockup photo and change ONLY the t-shirt fabric color to ${colorName}.

CRITICAL RULES — follow ALL of these precisely:
1. ONLY change the shirt/garment body color to ${colorName}
2. If there is a printed design on the shirt, DO NOT alter ANY colors within it — keep every design color exactly as-is
3. MATCH the EXACT same camera angle, distance, perspective, and framing
4. MATCH the EXACT same background scene, surface/table texture, lighting direction, and shadows
5. MATCH the EXACT same t-shirt folding style, lay position, and any props visible
6. Keep any printed design at the exact same size, position, and proportions
7. The output should look like it belongs in the SAME product photo set — only the fabric color changes
Product: ${productTitle}. Output a high quality product photo that is visually consistent with the original.`;

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
