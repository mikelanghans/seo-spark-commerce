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
1. A product mockup photo of a t-shirt — THIS IS YOUR STYLE REFERENCE for camera angle, lighting, background, and print SIZE
2. The original design/graphic that should be printed on the shirt

YOUR TASK: Generate a product mockup photo of a ${colorName} colored t-shirt with the design from image 2 printed on it.

ABSOLUTE NON-NEGOTIABLE RULES:

PRINT COLORS:
- Look at image 2 carefully. Whatever colors the design uses (white ink, white text, white graphics) — those EXACT colors must appear on EVERY shirt color, including ${colorName}.
- DO NOT invert, swap, or "adapt" the design colors based on the shirt color. If the original design is white ink, it stays WHITE INK on a white shirt, on a black shirt, on every shirt.
- DO NOT use black ink/text if the original design (image 2) uses white ink/text. The design colors are LOCKED.
- The print is OPAQUE SCREEN-PRINTED INK — it sits on top of the fabric with full opacity. It never blends, fades, or becomes translucent.

PRINT SIZE AND POSITION:
- The printed design must be the EXACT SAME SIZE relative to the shirt as shown in image 1. Measure it visually — the design should cover the same percentage of the shirt front.
- DO NOT shrink the design. DO NOT enlarge the design. Match the proportions EXACTLY from image 1.
- Position: upper chest area, centered horizontally, matching image 1's placement precisely.

PHOTO CONSISTENCY:
- MATCH image 1's camera angle, distance, perspective, framing EXACTLY
- MATCH image 1's background scene, surface texture, lighting, shadows EXACTLY
- MATCH image 1's t-shirt folding style, lay position, and props EXACTLY
- The ONLY difference from image 1 should be the fabric color (now ${colorName})

Product: ${productTitle}. The output must look like it belongs in the same product photo set as image 1.`
      : `Take this product mockup photo and change ONLY the t-shirt fabric color to ${colorName}.

ABSOLUTE NON-NEGOTIABLE RULES:

PRINT COLORS:
- Whatever colors the printed design currently uses — keep them EXACTLY the same. If the text is white, it stays WHITE on ${colorName}. If graphics are white, they stay WHITE.
- DO NOT invert or swap design colors. DO NOT change white text to black text or vice versa. The ink colors are LOCKED regardless of shirt color.
- The print is OPAQUE SCREEN-PRINTED INK — full opacity, sitting on top of the fabric, never blending or becoming translucent.

PRINT SIZE:
- The printed design must remain the EXACT SAME SIZE — same proportions, same coverage area on the shirt. Do not shrink or enlarge it at all.

PHOTO CONSISTENCY:
- MATCH the exact same camera angle, distance, perspective, framing
- MATCH the exact same background, surface, lighting, shadows
- MATCH the exact same t-shirt fold, lay position, and props
- ONLY the fabric color changes to ${colorName}

Product: ${productTitle}. Output must look like it belongs in the same product photo set.`;

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
