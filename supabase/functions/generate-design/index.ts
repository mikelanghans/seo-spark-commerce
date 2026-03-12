import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildPrompt(
  messageText: string,
  variant: "light-on-dark" | "dark-on-light",
  opts: {
    brandName: string; brandTone: string; brandNiche: string; brandAudience: string;
    brandFont: string; brandColor: string; brandFontSize: string; brandStyleNotes: string;
    designStyle: string; feedbackContext: string; inspirationContext: string;
    regenerateFeedback?: string; baseDesignUrl?: string; referenceImageUrl?: string;
  }
) {
  const fontDirection = opts.brandFont || "bold sans-serif";
  const isLightOnDark = variant === "light-on-dark";
  const isMinimalist = opts.designStyle === "minimalist";
  const defaultColor = isLightOnDark ? "#FFFFFF (white)" : "#000000 (black)";
  const colorDirection = isLightOnDark ? "#FFFFFF (white)" : (opts.brandColor || defaultColor);
  const bgColor = isLightOnDark ? "solid pure black (#000000)" : "solid pure white (#FFFFFF)";
  const sizeMap: Record<string, string> = {
    "small": "Subtle, understated text size — elegant and refined",
    "medium": "Medium text size — balanced and readable",
    "large": "Large, bold, dominant text — confident and attention-grabbing",
    "extra-large": "Extra large, maximum impact text — fills most of the canvas",
  };
  const sizeDirection = sizeMap[opts.brandFontSize || "large"] || sizeMap["large"];

  const noExtraTextRule = `\n\n🚫 ABSOLUTELY NO EXTRA TEXT: The design must contain ONLY the exact text provided above in "TEXT TO FEATURE". Do NOT add any additional words, taglines, slogans, brand names, dates, or decorative text. If the message already includes an attribution (like "— the universe"), that is part of the provided text. Do NOT invent or add anything else.\n\n🎨 FIGURE GUIDELINES: Use celestial/cosmic figures SPARINGLY — only when the message theme strongly calls for it. Most designs should rely on typography, geometric shapes, subtle textures, or minimal abstract accents instead. When a cosmic element IS used, keep it very subtle — a faint star, a thin crescent, a small dot pattern — NOT a dominant celestial figure. Do NOT include realistic human figures, astronauts in spacesuits, detailed faces, or anatomically specific body parts.`;

  const regenSuffix = `${noExtraTextRule}${opts.regenerateFeedback ? `\n\n⚠️ REGENERATION REQUEST: The user saw a previous version of this design and wants changes. Their feedback: "${opts.regenerateFeedback}". Apply this feedback while keeping the same message text and brand style.` : ""}${opts.baseDesignUrl ? `\n\n🖼️ BASE DESIGN: The first attached image is the previous version of this design. Use it as the starting point and apply the requested changes to it. Modify it according to the feedback while preserving its core style and layout.` : ""}${opts.referenceImageUrl ? `\n\n📎 REFERENCE IMAGE: The user has attached a reference image. Use it as visual inspiration for the style, layout, imagery, or mood of the design. Incorporate elements from the reference while keeping the brand identity and message text.` : ""}`;

  if (isMinimalist) {
    return `Design a premium, print-ready t-shirt graphic with MINIMALIST ILLUSTRATION + TEXT. Think high-end streetwear brand quality.

TEXT TO FEATURE: "${messageText}"

BRAND CONTEXT:
- Brand: ${opts.brandName || "lifestyle apparel"}
- Tone: ${opts.brandTone || "sarcastic but motivational"}
- Niche: ${opts.brandNiche || "lifestyle"}
- Target Audience: ${opts.brandAudience || "general"}

STRICT DESIGN RULES:

BACKGROUND: ${bgColor} — COMPLETELY SOLID, UNIFORM, FLAT COLOR. 
⛔ CRITICAL: Do NOT render a checkerboard pattern, transparency grid, or any gray-and-white checkered squares. The background must be ONE SINGLE SOLID COLOR with ZERO variation — pure ${isLightOnDark ? "black (#000000)" : "white (#FFFFFF)"} pixels everywhere. If you are tempted to show "transparency" — DON'T. Just use the solid color.

STYLE: MINIMALIST ILLUSTRATION WITH SUBTLE COLOR
- Create a simple, clean illustration or icon that pairs with the text message
- Think: line art, silhouettes, minimal shapes — NOT detailed or realistic
- The illustration should be conceptually connected to the message
- Examples: a wilting flower for "still growing", a sleeping cat for "nope", a cracked crown for "barely royal"
- Use clean lines, minimal detail — like a premium tattoo-style or indie brand illustration

TYPOGRAPHY:
- Font style: ${fontDirection}
- Text should be ${sizeDirection.toLowerCase()} but balanced with the illustration
- ⚠️ TEXT LEGIBILITY IS CRITICAL: Every letter must be perfectly sharp, crisp, and readable. Use thick stroke weights — no thin or wispy fonts.
- The illustration should be the primary visual, text secondary but always clearly readable
- If the message has a sub-attribution, set it small and elegant
- TEXT must remain monochrome (${isLightOnDark ? "white" : "dark"}) — do NOT color the text

COLOR PALETTE:
- Text/typography: ${colorDirection} (monochrome, single color)
- Illustration elements: Add 1-2 SUBTLE accent colors to the graphic/illustration parts ONLY
  - Choose muted, tasteful tones that complement the ${isLightOnDark ? "dark" : "light"} garment (e.g., dusty teal, warm amber, muted coral, sage green, soft gold)
  - The accents should feel intentional and premium — NOT neon, NOT saturated, NOT cartoonish
  - Keep most of the illustration in the primary ink color, with accents on 1-2 key elements
- Background: ${bgColor}
${isLightOnDark ? "IMPORTANT: This design is for DARK-colored garments. Text stays white. Illustration accents should be light/pastel tones that read well on dark fabric." : "IMPORTANT: This design is for LIGHT-colored garments. Text stays dark. Illustration accents should be deeper muted tones."}

COMPOSITION:
- Illustration centered, text below or integrated naturally
- Leave generous negative space
- The design should feel like it belongs on a $45 streetwear tee
- Maximum 3 visual elements: illustration + 1-2 text lines

${opts.brandStyleNotes ? `ADDITIONAL STYLE INSTRUCTIONS: ${opts.brandStyleNotes}` : ""}

OUTPUT: Standalone graphic centered on ${bgColor} background. No mockups, no t-shirt outlines. The background MUST be a perfectly uniform solid color — absolutely NO checkerboard or transparency grid patterns.
${opts.feedbackContext}${opts.inspirationContext}${regenSuffix}`;
  }

  return `Design a premium, print-ready t-shirt graphic. Think high-end streetwear brand quality — not generic clip art.

TEXT TO FEATURE: "${messageText}"

BRAND CONTEXT:
- Brand: ${opts.brandName || "lifestyle apparel"}
- Tone: ${opts.brandTone || "sarcastic but motivational"}
- Niche: ${opts.brandNiche || "lifestyle"}
- Target Audience: ${opts.brandAudience || "general"}

STRICT DESIGN RULES:

BACKGROUND: ${bgColor} — COMPLETELY SOLID, UNIFORM, FLAT COLOR. 
⛔ CRITICAL: Do NOT render a checkerboard pattern, transparency grid, or any gray-and-white checkered squares. The background must be ONE SINGLE SOLID COLOR with ZERO variation — pure ${isLightOnDark ? "black (#000000)" : "white (#FFFFFF)"} pixels everywhere. If you are tempted to show "transparency" — DON'T. Just use the solid color.

TYPOGRAPHY:
- Font style: ${fontDirection}
- ${sizeDirection}
- Use ONE typeface maximum — create hierarchy through weight, size, and spacing only
- Generous letter-spacing and line-height for a premium feel
- If the message has a sub-attribution (like "— the universe"), set it small, elegant, and understated
- ⚠️ TEXT LEGIBILITY IS CRITICAL: Every single letter must be perfectly sharp, crisp, and fully readable at arm's length. Use thick stroke weights. Do NOT use thin, wispy, or decorative fonts that sacrifice readability. If in doubt, go BOLDER.

COLOR: Use ${colorDirection} as the primary ink color on ${bgColor} background. No gradients in the text.
${isLightOnDark ? "IMPORTANT: This design is for DARK-colored garments. Use white or very light ink colors only. The design will be printed on black, navy, charcoal, or similar dark fabrics." : "IMPORTANT: This design is for LIGHT-colored garments. Use dark ink colors. The design will be printed on white, cream, light gray, or similar light fabrics."}

KEEP IT ULTRA CLEAN:
- NO decorative elements — no stars, no flourishes, no borders, no icons, no illustrations
- NO background shapes or boxes behind text
- Pure typography only — the power comes from the words and how they're set
- Maximum 2-3 visual elements total (including the text lines)

SIZE & FILL:
- ⚠️ CRITICAL: The design should FILL at least 70-80% of the canvas width. Do NOT leave excessive empty margins.
- Text should be LARGE and DOMINANT — this is streetwear, not a whisper. Scale up the typography to command attention.
- The design should feel dense and impactful, not floating in empty space.

COMPOSITION:
- Center the design vertically and horizontally
- The design should feel like it belongs on a $45 streetwear tee, not a tourist shop

${opts.brandStyleNotes ? `ADDITIONAL STYLE INSTRUCTIONS: ${opts.brandStyleNotes}` : ""}

OUTPUT: Standalone graphic centered on ${bgColor} background. No mockups, no t-shirt outlines. The background MUST be a perfectly uniform solid color — absolutely NO checkerboard or transparency grid patterns.
${opts.feedbackContext}${opts.inspirationContext}${regenSuffix}`;
}

async function generateImage(
  prompt: string,
  apiKey: string,
  baseDesignUrl?: string,
  referenceImageUrl?: string,
): Promise<string> {
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
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: "user",
            content: (baseDesignUrl || referenceImageUrl)
              ? [
                  { type: "text", text: prompt },
                  ...(baseDesignUrl ? [{ type: "image_url", image_url: { url: baseDesignUrl } }] : []),
                  ...(referenceImageUrl && referenceImageUrl !== baseDesignUrl ? [{ type: "image_url", image_url: { url: referenceImageUrl } }] : []),
                ]
              : prompt,
          }],
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
      break;
    }
    if (response?.ok) break;
  }

  if (!response || !response.ok) {
    const status = response?.status;
    if (status === 429) throw new Error("Rate limit exceeded. Please try again in a moment.");
    if (status === 402) throw new Error("AI credits exhausted.");
    const t = response ? await response.text() : lastError;
    console.error("AI gateway error:", status, t);
    throw new Error(`AI gateway error: ${status || "all models unavailable"}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;

  let imageBase64: string | null = null;

  if (message?.images?.length > 0) {
    imageBase64 = message.images[0].image_url?.url || null;
  }

  if (!imageBase64 && Array.isArray(message?.content)) {
    for (const part of message.content) {
      if (part.type === "image_url" && part.image_url?.url) {
        imageBase64 = part.image_url.url;
        break;
      }
      if (part.inline_data) {
        imageBase64 = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
        break;
      }
    }
  }

  if (!imageBase64 && typeof message?.content === "string" && message.content.startsWith("data:image")) {
    imageBase64 = message.content;
  }

  if (!imageBase64) {
    console.error("Unexpected response:", JSON.stringify(data).substring(0, 500));
    throw new Error("No image generated from AI response");
  }

  return imageBase64;
}

async function uploadImage(base64: string, userId: string, serviceClient: any): Promise<string> {
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
  const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
  const fileName = `${userId}/${crypto.randomUUID()}.png`;

  const { error: uploadError } = await serviceClient.storage
    .from("product-images")
    .upload(fileName, binaryData, { contentType: "image/png", upsert: true });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data: publicUrl } = serviceClient.storage
    .from("product-images")
    .getPublicUrl(fileName);

  return publicUrl.publicUrl;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");
    const userId = user.id;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { messageText, brandName, brandTone, brandNiche, brandAudience, brandFont, brandColor, brandFontSize, brandStyleNotes, messageId, organizationId, designVariant, designStyle, regenerateFeedback, referenceImageUrl, baseDesignUrl } = await req.json();
    if (!messageText) throw new Error("messageText is required");

    // Fetch recent design feedback to guide the AI
    let feedbackContext = "";
    let inspirationContext = "";
    if (organizationId) {
      const serviceClient2 = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      
      const [feedbackResult, productsResult, messagesResult] = await Promise.all([
        serviceClient2
          .from("design_feedback")
          .select("rating, notes")
          .eq("organization_id", organizationId)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),
        serviceClient2
          .from("products")
          .select("title, description, category, keywords, features")
          .eq("organization_id", organizationId)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10),
        serviceClient2
          .from("generated_messages")
          .select("message_text")
          .eq("organization_id", organizationId)
          .eq("user_id", userId)
          .eq("is_selected", true)
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

      const feedback = feedbackResult.data;
      if (feedback && feedback.length > 0) {
        const liked = feedback.filter((f: any) => f.rating === "up" && f.notes).map((f: any) => f.notes);
        const disliked = feedback.filter((f: any) => f.rating === "down" && f.notes).map((f: any) => f.notes);
        if (liked.length > 0) feedbackContext += `\n\nUSER PREFERENCES (things they liked in past designs):\n- ${liked.join("\n- ")}`;
        if (disliked.length > 0) feedbackContext += `\n\nUSER DISLIKES (avoid these in the design):\n- ${disliked.join("\n- ")}`;
      }

      const products = productsResult.data;
      const keptMessages = messagesResult.data;
      if ((products && products.length > 0) || (keptMessages && keptMessages.length > 0)) {
        inspirationContext = "\n\nBRAND CATALOG INSPIRATION (use for stylistic consistency, NOT to copy):";
        if (products && products.length > 0) {
          const productSummaries = products.map((p: any) => 
            `"${p.title}" (${p.category || "uncategorized"}) — ${(p.keywords || "").slice(0, 80)}`
          ).join("\n  • ");
          inspirationContext += `\nExisting products:\n  • ${productSummaries}`;
        }
        if (keptMessages && keptMessages.length > 0) {
          const msgList = keptMessages.map((m: any) => `"${m.message_text}"`).join(", ");
          inspirationContext += `\nKept message themes the brand resonates with: ${msgList}`;
        }
        inspirationContext += "\nUse these as context for the brand's aesthetic and thematic direction. Maintain visual cohesion with the existing catalog while keeping this design fresh and unique.";
      }
    }

    const promptOpts = {
      brandName: brandName || "",
      brandTone: brandTone || "",
      brandNiche: brandNiche || "",
      brandAudience: brandAudience || "",
      brandFont: brandFont || "",
      brandColor: brandColor || "",
      brandFontSize: brandFontSize || "large",
      brandStyleNotes: brandStyleNotes || "",
      designStyle: designStyle || "text-only",
      feedbackContext,
      inspirationContext,
      regenerateFeedback,
      baseDesignUrl,
      referenceImageUrl,
    };

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Generate BOTH variants in parallel
    // Step 1: Generate the light-on-dark design (white ink on black bg)
    console.log("Generating light-on-dark design...");
    const lightPrompt = buildPrompt(messageText, "light-on-dark", promptOpts);
    const lightBase64 = await generateImage(lightPrompt, LOVABLE_API_KEY, baseDesignUrl, referenceImageUrl);
    const lightDesignUrl = await uploadImage(lightBase64, userId, serviceClient);
    console.log("Light design:", lightDesignUrl);

    // Step 2: Derive dark-on-light by color-inverting the generated design
    console.log("Deriving dark-on-light variant from light design...");
    const invertPrompt = `You are given a t-shirt design image with WHITE/LIGHT colored text and graphics on a BLACK background.

Create an IDENTICAL version of this EXACT same design, but:
1. Change the background from black to pure white (#FFFFFF)
2. Change ALL white/light colored elements (text, graphics, lines, illustrations) to dark black/charcoal (#1A1A1A)
3. If there are any colored accent elements, keep them but adjust their brightness so they remain visible on the white background

CRITICAL RULES:
- The design must be PIXEL-PERFECT identical in layout, fonts, sizing, positioning, and graphic elements
- ONLY the colors change — nothing else
- Same text (letter-for-letter), same graphics, same composition
- Think of this as a simple color inversion / negative of the original
- Output ONLY the modified design image`;

    const darkBase64 = await generateImage(
      invertPrompt,
      LOVABLE_API_KEY,
      lightBase64, // Pass the generated light design as the base image to invert
    );
    const darkDesignUrl = await uploadImage(darkBase64, userId, serviceClient);
    console.log("Dark design:", darkDesignUrl);

    console.log("Light design:", lightDesignUrl);
    console.log("Dark design:", darkDesignUrl);

    // Save old design to history before overwriting
    if (messageId) {
      const { data: existingMsg } = await serviceClient
        .from("generated_messages")
        .select("design_url, dark_design_url, organization_id")
        .eq("id", messageId)
        .single();

      if (existingMsg?.design_url) {
        await serviceClient.from("design_history").insert({
          message_id: messageId,
          design_url: existingMsg.design_url,
          feedback_notes: regenerateFeedback || "",
          user_id: userId,
          organization_id: existingMsg.organization_id || organizationId,
        });
      }

      await serviceClient
        .from("generated_messages")
        .update({ design_url: lightDesignUrl, dark_design_url: darkDesignUrl })
        .eq("id", messageId)
        .eq("user_id", userId);
    }

    return new Response(JSON.stringify({ designUrl: lightDesignUrl, darkDesignUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-design error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg.includes("Rate limit") ? 429 : msg.includes("credits") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
