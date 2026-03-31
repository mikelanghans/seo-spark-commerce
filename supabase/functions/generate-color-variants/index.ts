import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COLOR_SWATCH_HINTS: Record<string, string> = {
  black: "deep neutral black (near #1A1A1A)",
  white: "soft natural cotton white (near #F5F5EF)",
  "true navy": "deep classic navy blue — clearly BLUE, not black (near #1F2A44). Must be visibly distinct from black",
  red: "clean medium red (near #B3272D)",
  moss: "muted earthy olive green (near #6F7A5D)",
  grey: "medium neutral heather gray (near #78797D)",
  "blue jean": "washed dusty denim blue (near #6E8090)",
  pepper: "MEDIUM CHARCOAL GRAY — NOT black. A warm-toned gray that is clearly LIGHTER than black, like a well-worn dark gray tee (near #5A5755). The fabric should look distinctly gray, not dark enough to be confused with black",
  "island green": "rich green-teal (near #2F8E79)",
  ivory: "warm off-white cream (near #F2E9D6)",
  crimson: "deep crimson red (near #8E1D2E)",
  espresso: "dark warm BROWN — clearly brown, not black (near #4A3228). Must show visible brown tones",
  midnight: "DARK NAVY BLUE — NOT black. Must show visible blue undertone (near #253147). Should be clearly distinguishable from black by its blue cast",
  sage: "muted light sage green (near #9BAC95)",
  chambray: "light muted blue-gray (near #8EA3B6)",
  "blue spruce": "deep teal-blue forest tone (near #3A5F5F)",
  butter: "soft warm yellow (near #F5E6A3)",
  yam: "warm burnt orange (near #C2622D)",
  "flo blue": "bright fluorescent blue (near #4DA8DA)",
  "island reef": "light aqua-teal (near #7EC8C8)",
  orchid: "light muted purple-pink (near #C4A5C9)",
  watermelon: "bright coral-pink (near #E86B6B)",
  terracotta: "warm earthy red-brown (near #C66B3D)",
  lagoon: "bright teal-blue (near #2E9E9E)",
  bay: "deep forest green (near #3A6B4F)",
  vineyard: "deep wine purple (near #5B3256)",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, colorName, productTitle, sourceWidth, sourceHeight, customInstructions, swatchHints: customSwatchHints } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const sizeHint = sourceWidth && sourceHeight
      ? `OUTPUT SIZE: The result MUST be ${sourceWidth}x${sourceHeight} pixels — identical to the input.`
      : "";

    // Use custom swatch hints if provided (product-type-aware), else fall back to built-in
    const effectiveSwatchHints = customSwatchHints || COLOR_SWATCH_HINTS;
    const swatchHint = effectiveSwatchHints[(colorName || "").toLowerCase().trim()]
      || `${colorName} with realistic garment dye tone`;

    const prompt = `You are editing a product mockup photo. Your ONLY task: change the t-shirt fabric color to "${colorName}".

IMAGE 1 is the IMMUTABLE master photo of a garment. Keep it pixel-locked:
- Same camera angle, distance, focal length, and crop
- Same shirt geometry (collar, sleeves, hem, fold silhouette)
- Same background texture, color, lighting, props, and prop positions
- Same wrinkles and shadow geometry on the shirt
- Same overall framing and composition — do NOT zoom, pan, reframe, or shift ANY element
- If there is any print/design on the shirt, keep it in the EXACT same position, size, and orientation
- Do NOT add, remove, move, resize, shift, or distort any elements

Your edit scope is ONLY fabric recoloring.
Color target (must match): ${swatchHint}.
- The recolored shirt MUST be visually distinguishable from black. If the target is a dark color (navy, charcoal, espresso), exaggerate its undertone slightly so viewers can clearly identify the color
- Preserve natural fabric texture and shadows while changing only hue/saturation/lightness of shirt fabric
- Keep white balance neutral; do not add color casts to the background or props
- Do NOT flatten the color to pure black — maintain the specific hue and saturation of the target

${sizeHint}

${customInstructions ? `ADDITIONAL USER INSTRUCTIONS (apply these while still following all rules above):\n${customInstructions}` : ""}

The output must look like the exact same photo with only the shirt fabric recolored to the target tone.`;

    const imageContent: any[] = [
      { type: "image_url", image_url: { url: imageBase64 } },
      { type: "text", text: prompt },
    ];

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
                  content: "You are a professional product photo editor. You recolor fabric in existing photos while preserving EVERYTHING else: composition, camera angle, background, props, lighting, shadows, and wrinkles. Your output must be indistinguishable from the input except for the fabric color. You ALWAYS output an image. Never respond with text only.",
                },
                { role: "user", content: imageContent },
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

        const compatImage = data?.data?.[0]?.b64_json || data?.data?.[0]?.url;
        if (!imageBase64Result && compatImage) {
          imageBase64Result = compatImage.startsWith("data:image")
            ? compatImage
            : compatImage.startsWith("http")
              ? compatImage
              : `data:image/png;base64,${compatImage}`;
        }

        if (imageBase64Result) break;

        const lowerText = textContent.toLowerCase();
        const lowerColor = (colorName || "").toLowerCase();
        const sameColorRefusal =
          lowerText.includes("already") &&
          (lowerText.includes(`already ${lowerColor}`) ||
            lowerText.includes(`already in ${lowerColor}`) ||
            lowerText.includes(`already ${lowerColor} colored`) ||
            lowerText.includes(`already ${lowerColor}-colored`));

        if (sameColorRefusal) {
          imageBase64Result = imageBase64;
          break;
        }

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
