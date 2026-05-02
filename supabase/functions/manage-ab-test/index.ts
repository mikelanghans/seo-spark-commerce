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

    const { testId, action, winnerVariant } = await req.json();
    if (!testId) throw new Error("testId required");

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Get test with product info
    const { data: test } = await adminClient
      .from("ab_tests")
      .select("*, product:products(shopify_product_id, organization_id)")
      .eq("id", testId)
      .single();
    if (!test) throw new Error("Test not found");

    // Verify caller is a member of the test's organization
    const { data: roleData } = await adminClient.rpc("get_org_role", {
      _user_id: userId,
      _org_id: test.organization_id,
    });
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Restrict mutating actions to owner/editor
    if ((action === "swap" || action === "end") && !["owner", "editor"].includes(roleData as string)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: evaluate — fetch Shopify data and update variant metrics
    if (action === "evaluate") {
      const { data: conn } = await adminClient
        .from("shopify_connections")
        .select("store_domain, access_token")
        .or(`organization_id.eq.${test.organization_id},user_id.eq.${userId}`)
        .not("access_token", "is", null)
        .limit(1)
        .maybeSingle();

      const variants = await adminClient
        .from("ab_test_variants")
        .select("*")
        .eq("test_id", testId);

      // If Shopify connected, try to pull real sales data
      if (conn?.access_token && test.product?.shopify_product_id) {
        const sinceDate = new Date(test.started_at).toISOString();
        const url = `https://${conn.store_domain}/admin/api/2024-01/orders.json?status=any&created_at_min=${sinceDate}&limit=250&fields=line_items,financial_status,created_at`;
        const res = await fetch(url, {
          headers: { "X-Shopify-Access-Token": conn.access_token, "Content-Type": "application/json" },
        });

        if (res.ok) {
          const { orders = [] } = await res.json();
          const shopifyId = String(test.product.shopify_product_id);
          let totalSales = 0;
          let totalRevenue = 0;

          for (const order of orders) {
            if (order.financial_status === "voided" || order.financial_status === "refunded") continue;
            for (const item of order.line_items || []) {
              if (String(item.product_id) === shopifyId) {
                totalSales += item.quantity;
                totalRevenue += parseFloat(item.price || "0") * item.quantity;
              }
            }
          }

          // Distribute sales to active variant
          if (variants.data) {
            const activeVariant = variants.data.find(v => v.is_active);
            if (activeVariant) {
              await adminClient.from("ab_test_variants").update({
                sales_count: totalSales,
                revenue: Math.round(totalRevenue * 100) / 100,
              }).eq("id", activeVariant.id);
            }
          }
        }
      }

      // Check if test duration has elapsed
      const elapsed = Date.now() - new Date(test.started_at).getTime();
      const durationMs = test.test_duration_days * 24 * 60 * 60 * 1000;
      const isExpired = elapsed >= durationMs;

      // Suggest winner based on revenue
      const { data: updatedVariants } = await adminClient
        .from("ab_test_variants")
        .select("*")
        .eq("test_id", testId)
        .order("revenue", { ascending: false });

      const suggested = updatedVariants?.[0]?.variant_label || null;

      return new Response(JSON.stringify({
        variants: updatedVariants,
        suggestedWinner: suggested,
        isExpired,
        daysRemaining: isExpired ? 0 : Math.ceil((durationMs - elapsed) / (24 * 60 * 60 * 1000)),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: swap — switch which variant is active on Shopify
    if (action === "swap") {
      const { data: variants } = await adminClient
        .from("ab_test_variants")
        .select("*")
        .eq("test_id", testId);

      if (variants) {
        for (const v of variants) {
          await adminClient.from("ab_test_variants")
            .update({ is_active: !v.is_active })
            .eq("id", v.id);
        }
      }

      return new Response(JSON.stringify({ message: "Variants swapped" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: end — declare a winner and close the test
    if (action === "end") {
      if (!winnerVariant) throw new Error("winnerVariant required");

      await adminClient.from("ab_tests").update({
        status: "completed",
        winner_variant: winnerVariant,
        ended_at: new Date().toISOString(),
      }).eq("id", testId);

      // Optionally update the listing with the winning variant's content
      const { data: winner } = await adminClient
        .from("ab_test_variants")
        .select("*")
        .eq("test_id", testId)
        .eq("variant_label", winnerVariant)
        .single();

      if (winner) {
        // Update or create the listing with winning content
        const { data: existingListing } = await adminClient
          .from("listings")
          .select("id")
          .eq("product_id", test.product_id)
          .eq("marketplace", "shopify")
          .maybeSingle();

        const listingData = {
          product_id: test.product_id,
          user_id: userId,
          marketplace: "shopify",
          title: winner.title,
          description: winner.description,
          tags: winner.tags,
          seo_title: winner.seo_title,
          seo_description: winner.seo_description,
          url_handle: winner.url_handle,
          alt_text: winner.alt_text,
        };

        if (existingListing) {
          await adminClient.from("listings").update(listingData).eq("id", existingListing.id);
        } else {
          await adminClient.from("listings").insert(listingData);
        }
      }

      return new Response(JSON.stringify({ message: `Test ended. Winner: Variant ${winnerVariant}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action. Use: evaluate, swap, or end");
  } catch (err: any) {
    console.error("manage-ab-test error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
