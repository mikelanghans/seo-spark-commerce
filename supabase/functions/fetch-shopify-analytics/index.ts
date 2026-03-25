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

    // Find Shopify connection
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
      return new Response(JSON.stringify({ orders: [], totalRevenue: 0, totalOrders: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch recent orders from Shopify (last 90 days)
    const sinceDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const shopifyUrl = `https://${connection.store_domain}/admin/api/2024-01/orders.json?status=any&created_at_min=${sinceDate}&limit=250&fields=id,created_at,total_price,line_items,financial_status`;

    const shopifyRes = await fetch(shopifyUrl, {
      headers: {
        "X-Shopify-Access-Token": connection.access_token,
        "Content-Type": "application/json",
      },
    });

    if (!shopifyRes.ok) {
      console.error("Shopify API error:", shopifyRes.status, await shopifyRes.text());
      return new Response(JSON.stringify({ orders: [], totalRevenue: 0, totalOrders: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shopifyData = await shopifyRes.json();
    const orders = shopifyData.orders || [];

    // Aggregate daily revenue
    const dailyRevenue: Record<string, number> = {};
    let totalRevenue = 0;
    let totalOrders = 0;

    for (const order of orders) {
      if (order.financial_status === "voided" || order.financial_status === "refunded") continue;
      const day = order.created_at.substring(0, 10);
      const amount = parseFloat(order.total_price || "0");
      dailyRevenue[day] = (dailyRevenue[day] || 0) + amount;
      totalRevenue += amount;
      totalOrders++;
    }

    // Build sorted daily array
    const revenueByDay = Object.entries(dailyRevenue)
      .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top selling products from line items
    const productSales: Record<string, { title: string; quantity: number; revenue: number }> = {};
    for (const order of orders) {
      if (order.financial_status === "voided" || order.financial_status === "refunded") continue;
      for (const item of order.line_items || []) {
        const key = item.product_id || item.title;
        if (!productSales[key]) {
          productSales[key] = { title: item.title, quantity: 0, revenue: 0 };
        }
        productSales[key].quantity += item.quantity;
        productSales[key].revenue += parseFloat(item.price || "0") * item.quantity;
      }
    }

    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }));

    return new Response(JSON.stringify({
      revenueByDay,
      topProducts,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("fetch-shopify-analytics error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
