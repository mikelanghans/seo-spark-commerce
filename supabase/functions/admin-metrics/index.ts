import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: authErr } = await anonClient.auth.getClaims(token);
    if (authErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    // Check admin role using service role client
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) throw new Error("Forbidden: admin role required");

    // Fetch metrics using service role (bypasses RLS)
    const [
      { count: totalUsers },
      { count: totalOrgs },
      { count: totalProducts },
      { count: totalListings },
      { count: totalAiUsage },
      { data: tickets },
      { data: recentProducts },
      { count: totalImages },
    ] = await Promise.all([
      supabase.from("organization_members").select("user_id", { count: "exact", head: true }),
      supabase.from("organizations").select("*", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("products").select("*", { count: "exact", head: true }),
      supabase.from("listings").select("*", { count: "exact", head: true }),
      supabase.from("ai_usage_log").select("*", { count: "exact", head: true }),
      supabase.from("support_tickets").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("products").select("id, title, category, price, created_at, organization_id").order("created_at", { ascending: false }).limit(20),
      supabase.from("product_images").select("*", { count: "exact", head: true }),
    ]);

    // Get unique user count
    const { data: uniqueUsers } = await supabase
      .from("organization_members")
      .select("user_id");
    const uniqueUserCount = new Set(uniqueUsers?.map((u: any) => u.user_id)).size;

    // AI usage last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: aiUsage30d } = await supabase
      .from("ai_usage_log")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo);

    return new Response(JSON.stringify({
      totalUsers: uniqueUserCount,
      totalOrgs: totalOrgs ?? 0,
      totalProducts: totalProducts ?? 0,
      totalListings: totalListings ?? 0,
      totalAiUsage: totalAiUsage ?? 0,
      aiUsage30d: aiUsage30d ?? 0,
      totalImages: totalImages ?? 0,
      tickets: tickets ?? [],
      recentProducts: recentProducts ?? [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const status = err.message.includes("Forbidden") ? 403 : err.message.includes("authenticated") ? 401 : 500;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
