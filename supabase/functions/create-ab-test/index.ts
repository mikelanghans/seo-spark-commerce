import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Auth failed" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { productId, organizationId, durationDays = 14 } = await req.json();
    if (!productId || !organizationId) throw new Error("productId and organizationId required");

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Authorization: caller must be owner/editor of organizationId
    const { data: roleData } = await adminClient.rpc("get_org_role", {
      _user_id: userId,
      _org_id: organizationId,
    });
    if (!roleData || !["owner", "editor"].includes(roleData as string)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get product + org context
    const [{ data: product }, { data: org }] = await Promise.all([
      adminClient.from("products").select("*").eq("id", productId).single(),
      adminClient.from("organizations").select("*").eq("id", organizationId).single(),
    ]);
    if (!product) throw new Error("Product not found");
    if (!org) throw new Error("Organization not found");

    // Ensure product belongs to the specified organization
    if ((product as any).organization_id !== organizationId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing listing as variant A baseline
    const { data: existingListing } = await adminClient
      .from("listings")
      .select("*")
      .eq("product_id", productId)
      .eq("marketplace", "shopify")
      .maybeSingle();

    // Generate a challenger variant B via AI
    const prompt = `You are an expert e-commerce SEO copywriter. Generate an ALTERNATIVE optimized Shopify listing for this product that takes a DIFFERENT creative angle from the current listing.

Business: ${org.name} | Niche: ${org.niche} | Tone: ${org.tone} | Audience: ${org.audience}

Product: ${product.title}
Description: ${product.description}
Features: ${product.features}
Category: ${product.category}
Keywords: ${product.keywords}

${existingListing ? `CURRENT LISTING (Variant A — do NOT duplicate this, create something distinctly different):
Title: ${existingListing.title}
Description: ${existingListing.description}
Tags: ${JSON.stringify(existingListing.tags)}` : "No existing listing — generate a fresh creative option."}

Generate a Shopify listing with a different angle: try a different emotional hook, keyword strategy, or benefit emphasis. Keep it brand-aligned but creatively distinct.

RULES:
- Plain text descriptions only (no markdown)
- Bullet points go in bulletPoints array
- seoTitle under 60 chars, seoDescription under 160 chars
- urlHandle: lowercase-hyphenated slug`;

    const listingSchema = {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        bulletPoints: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
        seoTitle: { type: "string" },
        seoDescription: { type: "string" },
        urlHandle: { type: "string" },
        altText: { type: "string" },
      },
      required: ["title", "description", "bulletPoints", "tags", "seoTitle", "seoDescription", "urlHandle", "altText"],
    };

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an expert e-commerce SEO copywriter. You MUST call the generate_variant function." },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "generate_variant",
            description: "Generate an alternative product listing variant",
            parameters: listingSchema,
          },
        }],
        tool_choice: { type: "function", function: { name: "generate_variant" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI service is temporarily unavailable. Please try again shortly." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");
    const variantB = JSON.parse(toolCall.function.arguments);

    // Create A/B test record
    const { data: test, error: testErr } = await adminClient
      .from("ab_tests")
      .insert({
        product_id: productId,
        organization_id: organizationId,
        user_id: userId,
        status: "running",
        test_duration_days: durationDays,
      })
      .select()
      .single();
    if (testErr) throw testErr;

    // Create variant A from existing listing (or generate a baseline)
    const variantAData = existingListing
      ? {
          title: existingListing.title,
          description: existingListing.description,
          tags: existingListing.tags,
          seo_title: existingListing.seo_title,
          seo_description: existingListing.seo_description,
          url_handle: existingListing.url_handle,
          alt_text: existingListing.alt_text,
        }
      : {
          title: product.title,
          description: product.description,
          tags: [],
          seo_title: product.title.substring(0, 60),
          seo_description: product.description.substring(0, 160),
          url_handle: product.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50),
          alt_text: product.title,
        };

    await adminClient.from("ab_test_variants").insert([
      {
        test_id: test.id,
        variant_label: "A",
        listing_id: existingListing?.id || null,
        title: variantAData.title,
        description: variantAData.description,
        tags: variantAData.tags,
        seo_title: variantAData.seo_title,
        seo_description: variantAData.seo_description,
        url_handle: variantAData.url_handle,
        alt_text: variantAData.alt_text,
        is_active: true,
      },
      {
        test_id: test.id,
        variant_label: "B",
        title: variantB.title,
        description: variantB.description,
        tags: variantB.tags || [],
        seo_title: variantB.seoTitle,
        seo_description: variantB.seoDescription,
        url_handle: variantB.urlHandle,
        alt_text: variantB.altText,
        is_active: false,
      },
    ]);

    return new Response(JSON.stringify({ testId: test.id, message: "A/B test created" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("create-ab-test error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
