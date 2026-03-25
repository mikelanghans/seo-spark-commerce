import { createClient } from "npm:@supabase/supabase-js@2.57.2";

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

    const { organizationId } = await req.json();
    if (!organizationId) throw new Error("organizationId required");

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Find Shopify connection (org-first, then user)
    let connection = null;
    const { data: orgConn } = await adminClient
      .from("shopify_connections")
      .select("store_domain, access_token")
      .eq("organization_id", organizationId)
      .maybeSingle();
    connection = orgConn;

    if (!connection) {
      const { data: userConn } = await adminClient
        .from("shopify_connections")
        .select("store_domain, access_token")
        .eq("user_id", userId)
        .maybeSingle();
      connection = userConn;
    }

    if (!connection?.access_token) {
      return new Response(JSON.stringify({ flagged: 0, message: "No Shopify connection found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get products that are synced to Shopify
    const { data: products } = await adminClient
      .from("products")
      .select("id, title, shopify_product_id")
      .eq("organization_id", organizationId)
      .not("shopify_product_id", "is", null);

    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ flagged: 0, message: "No synced products" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch orders for two 30-day windows: current vs previous
    const now = Date.now();
    const currentStart = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const previousStart = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
    const previousEnd = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const fetchOrders = async (min: string, max?: string) => {
      let url = `https://${connection!.store_domain}/admin/api/2024-01/orders.json?status=any&created_at_min=${min}&limit=250&fields=line_items,financial_status`;
      if (max) url += `&created_at_max=${max}`;
      const res = await fetch(url, {
        headers: { "X-Shopify-Access-Token": connection!.access_token!, "Content-Type": "application/json" },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.orders || [];
    };

    const [currentOrders, previousOrders] = await Promise.all([
      fetchOrders(currentStart),
      fetchOrders(previousStart, previousEnd),
    ]);

    // Build sales-per-shopify-product maps
    const countSales = (orders: any[]) => {
      const map: Record<string, number> = {};
      for (const order of orders) {
        if (order.financial_status === "voided" || order.financial_status === "refunded") continue;
        for (const item of order.line_items || []) {
          const pid = String(item.product_id || "");
          if (pid) map[pid] = (map[pid] || 0) + item.quantity;
        }
      }
      return map;
    };

    const currentSales = countSales(currentOrders);
    const previousSales = countSales(previousOrders);

    // Flag products with >30% sales velocity drop
    const DROP_THRESHOLD = -30;
    let flagged = 0;

    for (const product of products) {
      const shopifyId = String(product.shopify_product_id);
      const curr = currentSales[shopifyId] || 0;
      const prev = previousSales[shopifyId] || 0;

      if (prev === 0 && curr === 0) continue; // no data
      if (prev === 0) continue; // new product, no baseline

      const dropPct = Math.round(((curr - prev) / prev) * 100);
      if (dropPct > DROP_THRESHOLD) continue; // not declining enough

      // Check if already pending in queue
      const { data: existing } = await adminClient
        .from("listing_refresh_queue")
        .select("id")
        .eq("product_id", product.id)
        .eq("status", "pending")
        .maybeSingle();

      if (existing) continue; // already queued

      const reason = `Sales dropped ${Math.abs(dropPct)}% (${prev} → ${curr} units) over the last 30 days`;

      await adminClient.from("listing_refresh_queue").insert({
        product_id: product.id,
        organization_id: organizationId,
        user_id: userId,
        reason,
        sales_current: curr,
        sales_previous: prev,
        velocity_drop_pct: dropPct,
        status: "pending",
      });

      flagged++;
    }

    return new Response(JSON.stringify({ flagged, message: `${flagged} product(s) flagged for listing refresh` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("check-listing-health error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
