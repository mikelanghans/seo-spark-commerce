import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { deductCredits, insufficientCreditsResponse } from "../_shared/credits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { designUrl, messageId, organizationId } = body;
    const quality: "standard" | "pro" = body.quality === "pro" ? "pro" : "standard";
    if (!designUrl) throw new Error("designUrl is required");

    // Credit pre-check (cost depends on chosen quality tier)
    const costKey = quality === "pro" ? "generate-dark-design" : "generate-dark-design-standard";
    const creditOk = await deductCredits(user.id, costKey);
    if (!creditOk) return insufficientCreditsResponse(costKey);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    console.log(`Generating dark variant of design (quality=${quality})...`);

    const model = quality === "pro"
      ? "google/gemini-3-pro-image-preview"
      : "google/gemini-3.1-flash-image-preview";

    // Use AI to create a dark/black version of the design for light-colored shirts
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "TASK: Recolor this transparent-background t-shirt design so every white/light-neutral element becomes pure solid dark charcoal #1a1a1a. This is a COLOR SWAP ONLY — not a stylization.\n\nABSOLUTE REQUIREMENTS:\n1. SOLID FILLS ONLY. The recolored elements must be 100% opaque flat #1a1a1a, like clean vector art. ZERO grain, ZERO noise, ZERO speckles, ZERO halftone dots, ZERO distressing, ZERO vintage/worn/faded/cracked/textured look, ZERO sketchy edges, ZERO gradient inside fills. If you see any speckle pattern in your output, you have failed.\n2. CRISP EDGES. Every letter, shape, and line must have razor-sharp, smooth, anti-aliased edges — not jagged, not fuzzy, not stippled.\n3. PRESERVE COLORED ELEMENTS EXACTLY. Any element that is already pink, rose, gold, metallic, gradient, or any non-neutral color must remain pixel-identical — same color, same position, same shape. Do NOT recolor them. Only pure white / off-white / light-gray elements get swapped to #1a1a1a.\n4. PRESERVE LAYOUT EXACTLY. Same fonts, same letterforms, same kerning, same sizes, same positions, same proportions, same composition.\n5. TRANSPARENT BACKGROUND. Output PNG with full alpha transparency around the artwork.\n6. HIGH RESOLUTION, clean print-ready output.\n\nThink: 'flat vector recolor in Illustrator', NOT 'distressed screenprint effect'.",
              },
              {
                type: "image_url",
                image_url: { url: designUrl },
              },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`AI generation failed (${aiResponse.status}): ${errText}`);
    }

    const aiData = await aiResponse.json();
    const generatedImage = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!generatedImage) {
      throw new Error("AI did not return an image");
    }

    // Upload the dark design to Supabase storage
    const base64Data = generatedImage.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const fileName = `dark-designs/${user.id}/${crypto.randomUUID()}.png`;

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: storageError } = await adminClient.storage
      .from("product-images")
      .upload(fileName, imageBytes, { contentType: "image/png", upsert: true });

    if (storageError) throw new Error(`Storage upload failed: ${storageError.message}`);

    const { data: urlData } = adminClient.storage
      .from("product-images")
      .getPublicUrl(fileName);

    console.log("Dark design saved:", urlData.publicUrl);

    // Update the generated message with the dark variant URL
    if (messageId) {
      await adminClient
        .from("generated_messages")
        .update({ dark_design_url: urlData.publicUrl })
        .eq("id", messageId)
        .eq("user_id", user.id);
    }
    return new Response(JSON.stringify({
      success: true,
      darkDesignUrl: urlData.publicUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-dark-design error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
