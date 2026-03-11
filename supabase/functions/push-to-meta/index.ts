import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const userId = claims.claims.sub as string;
    const { productId, listing, images } = await req.json();

    // Get Meta connection
    const { data: conn, error: connError } = await supabase
      .from("meta_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (connError) throw new Error("Failed to load Meta connection");
    if (!conn) throw new Error("No Meta connection found. Add your credentials in Settings.");

    const { catalog_id, access_token } = conn;
    if (!catalog_id || !access_token) throw new Error("Meta catalog ID or access token is missing");

    // Check if product already has a meta_listing_id
    const { data: product } = await supabase
      .from("products")
      .select("meta_listing_id")
      .eq("id", productId)
      .single();

    const existingId = product?.meta_listing_id;

    // Build product data for Meta Commerce API
    const retailerId = `brandaura_${productId.replace(/-/g, "").slice(0, 20)}`;
    
    const productData = {
      retailer_id: retailerId,
      data: {
        name: listing.title?.slice(0, 150) || "Untitled",
        description: listing.description?.slice(0, 5000) || "",
        url: `https://example.com/products/${listing.url_handle || productId}`,
        price: `${Math.round(parseFloat(listing.price || "0") * 100)} USD`,
        availability: "in stock",
        condition: "new",
        visibility: "staging", // This makes it a DRAFT
        ...(images?.length > 0 ? { image_url: images[0].image_url } : {}),
      },
    };

    // Use batch API to create/update product in catalog
    const batchUrl = `https://graph.facebook.com/v19.0/${catalog_id}/batch`;
    
    const batchBody = new URLSearchParams();
    batchBody.append("access_token", access_token);
    batchBody.append("requests", JSON.stringify([
      {
        method: existingId ? "UPDATE" : "CREATE",
        retailer_id: retailerId,
        data: productData.data,
      },
    ]));

    const metaRes = await fetch(batchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: batchBody.toString(),
    });

    const metaResult = await metaRes.json();

    if (!metaRes.ok || metaResult.error) {
      console.error("Meta API error:", JSON.stringify(metaResult));
      throw new Error(metaResult.error?.message || `Meta API error: ${metaRes.status}`);
    }

    // Check for individual item errors
    if (metaResult.handles) {
      const handle = metaResult.handles[0];
      if (handle?.errors?.length > 0) {
        throw new Error(handle.errors[0]?.message || "Meta batch item error");
      }
    }

    // Update product with meta listing reference
    await supabase
      .from("products")
      .update({ meta_listing_id: retailerId })
      .eq("id", productId);

    const action = existingId ? "updated" : "created as draft";

    return new Response(JSON.stringify({ success: true, action, retailer_id: retailerId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("push-to-meta error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
