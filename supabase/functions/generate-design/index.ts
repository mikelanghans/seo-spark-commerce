import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PNG } from "npm:pngjs@7.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Unauthorized");
    const userId = claimsData.claims.sub as string;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { messageText, brandName, brandTone, brandNiche, brandAudience, brandFont, brandColor, brandFontSize, brandStyleNotes, messageId, organizationId } = await req.json();
    if (!messageText) throw new Error("messageText is required");

    // Fetch recent design feedback to guide the AI
    let feedbackContext = "";
    let inspirationContext = "";
    if (organizationId) {
      const serviceClient2 = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      
      // Fetch feedback, existing products, and kept messages in parallel
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

        if (liked.length > 0) {
          feedbackContext += `\n\nUSER PREFERENCES (things they liked in past designs):\n- ${liked.join("\n- ")}`;
        }
        if (disliked.length > 0) {
          feedbackContext += `\n\nUSER DISLIKES (avoid these in the design):\n- ${disliked.join("\n- ")}`;
        }
      }

      // Build inspiration context from existing catalog
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

    const fontDirection = brandFont || "bold sans-serif";
    const colorDirection = brandColor || "#000000 (black)";
    const sizeMap: Record<string, string> = {
      "small": "Subtle, understated text size — elegant and refined",
      "medium": "Medium text size — balanced and readable",
      "large": "Large, bold, dominant text — confident and attention-grabbing",
      "extra-large": "Extra large, maximum impact text — fills most of the canvas",
    };
    const sizeDirection = sizeMap[brandFontSize || "large"] || sizeMap["large"];

    const prompt = `Design a premium, print-ready t-shirt graphic. Think high-end streetwear brand quality — not generic clip art.

TEXT TO FEATURE: "${messageText}"

BRAND CONTEXT:
- Brand: ${brandName || "lifestyle apparel"}
- Tone: ${brandTone || "sarcastic but motivational"}
- Niche: ${brandNiche || "lifestyle"}
- Target Audience: ${brandAudience || "general"}

STRICT DESIGN RULES:

BACKGROUND: Solid pure white (#FFFFFF). No patterns, no gradients, no checkered grids, no textures.

TYPOGRAPHY:
- Font style: ${fontDirection}
- ${sizeDirection}
- Use ONE typeface maximum — create hierarchy through weight, size, and spacing only
- Generous letter-spacing and line-height for a premium feel
- If the message has a sub-attribution (like "— the universe"), set it small, elegant, and understated

COLOR: Use ${colorDirection} as the primary ink color on white background. No gradients in the text.

KEEP IT ULTRA CLEAN:
- NO decorative elements — no stars, no flourishes, no borders, no icons, no illustrations
- NO background shapes or boxes behind text
- Pure typography only — the power comes from the words and how they're set
- Maximum 2-3 visual elements total (including the text lines)

COMPOSITION:
- Center the design vertically and horizontally
- Leave generous breathing room / negative space around the text
- The design should feel like it belongs on a $45 streetwear tee, not a tourist shop

${brandStyleNotes ? `ADDITIONAL STYLE INSTRUCTIONS: ${brandStyleNotes}` : ""}

OUTPUT: Standalone graphic centered on solid white background. No mockups, no t-shirt outlines.
${feedbackContext}`;

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
            messages: [{ role: "user", content: prompt }],
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

    // Extract image from response
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

    // Remove white background to create true transparency
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const rawBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    
    let binaryData: Uint8Array;
    try {
      const png = PNG.sync.read(Buffer.from(rawBuffer));
      const threshold = 240; // pixels with R,G,B all above this become transparent
      for (let i = 0; i < png.data.length; i += 4) {
        const r = png.data[i];
        const g = png.data[i + 1];
        const b = png.data[i + 2];
        if (r >= threshold && g >= threshold && b >= threshold) {
          png.data[i + 3] = 0; // set alpha to 0 (transparent)
        }
      }
      const outputBuffer = PNG.sync.write(png);
      binaryData = new Uint8Array(outputBuffer);
      console.log("White background removed successfully");
    } catch (e) {
      console.error("Failed to remove background, using original:", e);
      binaryData = rawBuffer;
    }
    
    const fileName = `${userId}/${crypto.randomUUID()}.png`;

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { error: uploadError } = await serviceClient.storage
      .from("product-images")
      .upload(fileName, binaryData, { contentType: "image/png", upsert: true });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: publicUrl } = serviceClient.storage
      .from("product-images")
      .getPublicUrl(fileName);

    const designUrl = publicUrl.publicUrl;

    // Update the message with the design URL if messageId provided
    if (messageId) {
      await serviceClient
        .from("generated_messages")
        .update({ design_url: designUrl })
        .eq("id", messageId)
        .eq("user_id", userId);
    }

    return new Response(JSON.stringify({ designUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-design error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
