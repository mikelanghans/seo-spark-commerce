import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { organizationId } = await req.json().catch(() => ({}));

    // Try org-level token first, then fall back to env var
    let printifyToken = Deno.env.get("PRINTIFY_API_TOKEN");
    if (organizationId) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: secrets } = await adminClient
        .from("organization_secrets")
        .select("printify_api_token")
        .eq("organization_id", organizationId)
        .single();
      if (secrets?.printify_api_token) printifyToken = secrets.printify_api_token;
    }

    if (!printifyToken) {
      return new Response(JSON.stringify({ error: "Printify API token not configured. Add your token in Settings → Marketplace." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.printify.com/v1/shops.json", {
      headers: { Authorization: `Bearer ${printifyToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401) {
        return new Response(JSON.stringify({ error: "Printify API token is invalid or expired. Please update it in Settings → Marketplace." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Printify API error (${res.status}): ${text}`);
    }

    const shops = await res.json();

    return new Response(JSON.stringify({ shops }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("printify-get-shops error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
