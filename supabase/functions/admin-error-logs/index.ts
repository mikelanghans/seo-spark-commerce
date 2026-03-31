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
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse query params
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
    const offset = parseInt(url.searchParams.get("offset") || "0");
    const source = url.searchParams.get("source"); // filter by error_source
    const daysBack = parseInt(url.searchParams.get("days") || "7");

    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("error_logs")
      .select("*", { count: "exact" })
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (source) {
      query = query.eq("error_source", source);
    }

    const { data: logs, count, error: queryErr } = await query;
    if (queryErr) throw queryErr;

    return new Response(JSON.stringify({ logs: logs ?? [], total: count ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    const status = err.message?.includes("Forbidden") ? 403 : 500;
    return new Response(JSON.stringify({ error: err.message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
