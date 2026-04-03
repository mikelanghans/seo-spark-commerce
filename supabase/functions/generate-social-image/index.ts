import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getUserIdFromAuth, deductCredits, insufficientCreditsResponse } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { productTitle, productDescription, brandName, brandNiche, platform, imageUrl } = await req.json();

    const platformSpecs: Record<string, string> = {
      instagram: "Square 1:1 format, vibrant colors, lifestyle aesthetic, clean typography overlay",
      tiktok: "Vertical 9:16 format, bold eye-catching, trendy Gen-Z aesthetic, dynamic composition",
      x: "Horizontal 16:9 format, minimal and clean, professional, sharp contrast",
      facebook: "Landscape 1.91:1 format, warm community feel, clear product showcase",
    };

    const spec = platformSpecs[platform] || platformSpecs.instagram;

    const prompt = `Create a professional social media promotional image for ${platform}.

Product: "${productTitle}"
${productDescription ? `Description: ${productDescription}` : ""}
Brand: ${brandName || "lifestyle brand"}
Niche: ${brandNiche || "lifestyle"}

Requirements:
- ${spec}
- Feature the product name "${productTitle}" as stylish text overlay
- Modern, scroll-stopping design that feels native to ${platform}
- Use bold typography and attractive color palette
- Include subtle branding elements
- Professional product marketing aesthetic
- NO mockup of a phone or device, just the graphic itself
- Clean composition ready to post directly`;

    const messages: any[] = [
      {
        role: "user",
        content: imageUrl
          ? [
              { type: "text", text: prompt + "\n\nUse this product image as reference and incorporate it into the design:" },
              { type: "image_url", image_url: { url: imageUrl } },
            ]
          : prompt,
      },
    ];

    // Try primary model, fall back on error
    const models = ["google/gemini-3.1-flash-image-preview", "google/gemini-3-pro-image-preview"];
    let imageBase64: string | null = null;

    for (const model of models) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, modalities: ["image", "text"] }),
      });

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
        // Try next model on 5xx
        if (status >= 500 && model !== models[models.length - 1]) {
          console.warn(`Model ${model} returned ${status}, trying fallback...`);
          continue;
        }
        const t = await response.text();
        console.error("AI gateway error:", status, t);
        throw new Error(`AI gateway error: ${status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message;

      // Extract image from response
      if (content?.images?.length) {
        imageBase64 = content.images[0].image_url?.url;
      } else if (Array.isArray(content?.content)) {
        for (const part of content.content) {
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

      if (imageBase64) break;
    }

    if (!imageBase64) throw new Error("No image generated");

    // Upload to storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Convert base64 to binary
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const fileName = `social/${platform}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await sb.storage
      .from("product-images")
      .upload(fileName, binaryData, { contentType: "image/png", upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error("Failed to upload image");
    }

    const { data: urlData } = sb.storage.from("product-images").getPublicUrl(fileName);

    return new Response(JSON.stringify({ imageUrl: urlData.publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-social-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
