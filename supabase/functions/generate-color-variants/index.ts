import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, colorName, productTitle, designImageBase64, sourceWidth, sourceHeight } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const LIGHT_COLORS = new Set([
      "ivory", "butter", "banana", "blossom", "orchid", "chalky mint",
      "island reef", "chambray", "white", "flo blue", "watermelon",
      "neon pink", "neon green", "lagoon blue", "yam", "terracotta",
      "light green", "bay", "sage",
    ]);
    const isLightShirt = LIGHT_COLORS.has((colorName || "").toLowerCase().trim());

    const inkRule = isLightShirt
      ? `The design uses white/light ink that would be invisible on ${colorName}. Change the design's ink to DARK BLACK/CHARCOAL. Keep everything else about the design identical — same text, fonts, graphics, layout, size, position.`
      : `Keep the design's ink colors exactly as-is: bright opaque white (#FFFFFF) and fully saturated colors. The ink is a physical layer ON TOP of the fabric — it must NOT blend, fade, or absorb into the shirt. Think of a bright white sticker on dark fabric.`;

    const sizeHint = sourceWidth && sourceHeight
      ? `OUTPUT SIZE: The result MUST be ${sourceWidth}x${sourceHeight} pixels — identical to the input.`
      : "";

    const hasDesignRef = !!designImageBase64;
    const prompt = hasDesignRef
      ? `You are editing a product mockup photo. Your ONLY task: change the t-shirt fabric color to "${colorName}".

IMAGE 1 is the MASTER reference photo — you must clone it EXACTLY:
- Same camera angle, distance, focal length, crop
- Same background texture, color, lighting
- Same styling props (jeans, sunglasses, dried flowers, etc.) in the same positions  
- Same shirt fold pattern, wrinkles, and shadows
- Same overall composition and framing — do NOT zoom, crop, or reframe

IMAGE 2 is the design graphic printed on the shirt. Place it in the exact same position and size as shown in IMAGE 1.

${inkRule}

${sizeHint}

The output should look like someone opened the reference photo in Photoshop, selected ONLY the fabric pixels with a magic wand, and filled them with ${colorName}. Nothing else changes.`
      : `You are editing a product mockup photo. Your ONLY task: change the t-shirt fabric color to "${colorName}".

Clone the reference photo EXACTLY:
- Same camera angle, distance, focal length, crop
- Same background texture, color, lighting  
- Same styling props in the same positions
- Same shirt fold pattern, wrinkles, and shadows
- Same design/print in the exact same position and size

${inkRule}

${sizeHint}

The output should look like someone opened this photo in Photoshop, selected ONLY the fabric pixels, and filled them with ${colorName}. Nothing else changes.`;

    // Build content: reference image first, then design, then text
    const imageContent: any[] = [
      { type: "image_url", image_url: { url: imageBase64 } },
    ];
    if (designImageBase64) {
      imageContent.push({ type: "image_url", image_url: { url: designImageBase64 } });
    }
    imageContent.push({ type: "text", text: prompt });

    // Use a single model consistently — gemini-2.5-flash-image is best for controlled edits
    const models = [
      "google/gemini-2.5-flash-image",
      "google/gemini-3.1-flash-image-preview",
    ];

    let imageBase64Result: string | null = null;

    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));

        let response: Response;
        try {
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
                  role: "system",
                  content: "You are a professional product photo editor. You edit existing photos by recoloring fabric while preserving EVERYTHING else: composition, camera angle, background, props, lighting, shadows, wrinkles, design placement. Your output must be indistinguishable from the input except for the fabric color. You ALWAYS output an image. Never respond with text only.",
                },
                {
                  role: "user",
                  content: imageContent,
                },
              ],
              modalities: ["image", "text"],
            }),
          });
        } catch (fetchErr) {
          console.error(`Fetch error on attempt ${attempt + 1} with ${model}:`, fetchErr);
          continue;
        }

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
          if (status === 503 || status === 500) {
            console.error(`Attempt ${attempt + 1} with ${model}: ${status}`);
            continue;
          }
          break;
        }

        const data = await response.json();
        const message = data.choices?.[0]?.message;
        const textContent = typeof message?.content === "string"
          ? message.content
          : Array.isArray(message?.content)
            ? message.content.filter((p: any) => p?.type === "text" && typeof p?.text === "string").map((p: any) => p.text).join("\n")
            : "";

        // Extract image from response (chat-completions style)
        if (message?.images?.length > 0) {
          imageBase64Result = message.images[0].image_url?.url || null;
        }
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
        if (!imageBase64Result && typeof message?.content === "string" && message.content.startsWith("data:image")) {
          imageBase64Result = message.content;
        }

        // Extract image from alternate payload shape (images endpoint compatibility)
        const compatImage = data?.data?.[0]?.b64_json || data?.data?.[0]?.url;
        if (!imageBase64Result && compatImage) {
          imageBase64Result = compatImage.startsWith("data:image")
            ? compatImage
            : compatImage.startsWith("http")
              ? compatImage
              : `data:image/png;base64,${compatImage}`;
        }

        if (imageBase64Result) break;

        // If the model refuses because source already matches target color, keep original image
        const lowerText = textContent.toLowerCase();
        const lowerColor = (colorName || "").toLowerCase();
        const sameColorRefusal =
          (lowerText.includes("cannot recolor") || lowerText.includes("already")) &&
          lowerText.includes(`to ${lowerColor}`);

        if (sameColorRefusal) {
          imageBase64Result = imageBase64;
          break;
        }

        // AI returned text only (no image) — retry
        console.warn(`Attempt ${attempt + 1} with ${model}: AI returned text only, retrying...`);
      }
      if (imageBase64Result) break;
    }

    if (!imageBase64Result) {
      throw new Error("No image generated from AI response after all retries");
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
