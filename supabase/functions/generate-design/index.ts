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

    const { messageText, brandName, brandTone, messageId } = await req.json();
    if (!messageText) throw new Error("messageText is required");

    const prompt = `Create a minimalist t-shirt design graphic for print-on-demand. The design should be:

MESSAGE TEXT: "${messageText}"

BRAND: ${brandName || "lifestyle apparel"}
TONE: ${brandTone || "sarcastic but motivational"}

DESIGN REQUIREMENTS:
- Clean, print-ready graphic on a pure white background (no t-shirt mockup, just the design itself)
- Modern minimalist typography — the text should be the star
- Use a mix of bold and thin fonts for visual hierarchy
- Can include subtle decorative elements (small stars, lines, brackets, dashes)
- Black and white primary palette with optional single accent color (gold, muted yellow, or muted coral)
- The design should look great when printed small on a chest pocket area OR large across the front
- Text should be crisp and legible
- Include any attribution like "— the universe" as a smaller sub-text if it fits the message
- NO mockups, NO t-shirt outlines — just the standalone graphic design on white

Output a high-resolution design graphic ready for print.`;

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

    // Upload to storage
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
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
