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

    // Credit pre-check
    const creditOk = await deductCredits(user.id, "generate-dark-design");
    if (!creditOk) return insufficientCreditsResponse("generate-dark-design");

    const { designUrl, messageId, organizationId } = await req.json();
    if (!designUrl) throw new Error("designUrl is required");

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    console.log("Generating dark variant of design...");

    // Use AI to create a dark/black version of the design for light-colored shirts
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "This is a t-shirt design with white/light colored text and graphics on a transparent background. Create an IDENTICAL version of this exact design, but recolor the white/light NEUTRAL text and graphics to a SOLID, CLEAN dark charcoal/black (#1a1a1a). CRITICAL QUALITY RULES: (1) Fills must be perfectly SOLID and uniform — NO grain, NO noise, NO distressing, NO speckles, NO halftone, NO vintage texture, NO faded/washed-out look. Every letter and shape must have crisp, clean, fully-opaque edges as if vector art. (2) Preserve ALL original colored/metallic/golden/gradient decorative elements EXACTLY as-is — do not recolor them. Only the neutral white/light-gray elements get darkened. (3) Keep the exact same layout, fonts, letterforms, kerning, sizing, positioning, and proportions. (4) Background must remain fully transparent. Output ONLY the modified design image at high resolution with razor-sharp, smooth, solid fills.",
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
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
