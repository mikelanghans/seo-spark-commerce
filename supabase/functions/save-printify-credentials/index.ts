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

    const { organizationId, printifyToken, action } = await req.json();
    if (!organizationId) throw new Error("organizationId is required");

    // Verify user is owner/editor of this org
    const { data: roleData } = await supabase.rpc("get_org_role", {
      _user_id: user.id,
      _org_id: organizationId,
    });
    if (!roleData || !["owner", "editor"].includes(roleData)) {
      throw new Error("Insufficient permissions");
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (action === "check") {
      const { data: secrets } = await adminClient
        .from("organization_secrets")
        .select("printify_api_token")
        .eq("organization_id", organizationId)
        .single();
      const hasToken = !!(secrets?.printify_api_token && secrets.printify_api_token.trim());
      return new Response(JSON.stringify({ hasToken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      const { error } = await adminClient
        .from("organization_secrets")
        .update({ printify_api_token: "", updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, disconnected: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save token
    if (!printifyToken?.trim()) throw new Error("printifyToken is required");

    const { error } = await adminClient
      .from("organization_secrets")
      .upsert({
        organization_id: organizationId,
        printify_api_token: printifyToken.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id" });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("save-printify-credentials error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
