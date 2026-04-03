import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, productId, listing, images, updateFields } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Get Etsy connection
    const { data: conn, error: connErr } = await sb
      .from("etsy_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (connErr || !conn) {
      return new Response(JSON.stringify({ error: "No Etsy connection found. Please connect your Etsy shop first." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = conn.api_key;
    const shopId = conn.shop_id;

    if (!apiKey || !shopId) {
      return new Response(JSON.stringify({ error: "Etsy API key or Shop ID missing." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get current product to check for existing listing
    const { data: product } = await sb.from("products").select("etsy_listing_id").eq("id", productId).maybeSingle();
    const existingListingId = product?.etsy_listing_id;

    const tags = (listing.tags || []).slice(0, 13); // Etsy max 13 tags
    const description = (listing.description || "").replace(/[#*_]/g, ""); // Strip markdown

    const baseUrl = "https://openapi.etsy.com/v3";

    if (existingListingId) {
      // Build selective update payload
      const include = (field: string) => !updateFields || updateFields.includes(field);
      const updatePayload: Record<string, unknown> = {};
      if (include("title")) updatePayload.title = listing.title.slice(0, 140);
      if (include("description")) updatePayload.description = description;
      if (include("tags")) updatePayload.tags = tags;
      if (include("pricing")) updatePayload.price = parseFloat(listing.price || "0") || 9.99;

      if (Object.keys(updatePayload).length === 0) {
        return new Response(JSON.stringify({ success: true, listing_id: existingListingId, action: "nothing to update" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update existing listing
      const updateRes = await fetch(`${baseUrl}/application/shops/${shopId}/listings/${existingListingId}`, {
        method: "PATCH",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          ...(conn.access_token ? { Authorization: `Bearer ${conn.access_token}` } : {}),
        },
        body: JSON.stringify(updatePayload),
      });

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        console.error("Etsy update error:", updateRes.status, errText);
        throw new Error(`Etsy update failed: ${updateRes.status}`);
      }

      return new Response(JSON.stringify({ success: true, listing_id: existingListingId, action: "updated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Create new listing
      const createRes = await fetch(`${baseUrl}/application/shops/${shopId}/listings`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          ...(conn.access_token ? { Authorization: `Bearer ${conn.access_token}` } : {}),
        },
        body: JSON.stringify({
          title: listing.title.slice(0, 140),
          description,
          tags,
          price: parseFloat(listing.price || "0") || 9.99,
          quantity: 999,
          who_made: "i_did",
          when_made: "made_to_order",
          taxonomy_id: 0, // Will need to be mapped per category
          shipping_profile_id: 0, // Required — user needs to set up in Etsy
          is_digital: false,
          should_auto_renew: true,
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error("Etsy create error:", createRes.status, errText);

        if (createRes.status === 401 || createRes.status === 403) {
          throw new Error("Etsy authentication failed. Your API key may be invalid or expired.");
        }
        throw new Error(`Etsy create failed: ${createRes.status} — ${errText.slice(0, 200)}`);
      }

      const result = await createRes.json();
      const listingId = result.listing_id?.toString() || result.results?.listing_id?.toString();

      // Save listing ID back to product
      if (listingId) {
        await sb.from("products").update({ etsy_listing_id: listingId } as any).eq("id", productId);
      }

      return new Response(JSON.stringify({ success: true, listing_id: listingId, action: "created" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("push-to-etsy error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
