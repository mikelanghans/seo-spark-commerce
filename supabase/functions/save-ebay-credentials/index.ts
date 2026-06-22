import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encrypt } from "../_shared/encryption.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// This function replaces direct frontend writes to ebay_connections so that
// client_secret is encrypted server-side before it ever reaches the database.
// The browser must never hold the ENCRYPTION_KEY, so this step has to happen here.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json().catch(() => ({}));
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
    const ruName = typeof body.ruName === "string" ? body.ruName.trim() : "";
    const environment = typeof body.environment === "string" ? body.environment : "production";

    if (!clientId || !ruName) {
      throw new Error("Client ID and RuName are required");
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: existing } = await adminClient
      .from("ebay_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing && !clientSecret) {
      throw new Error("Client Secret is required");
    }

    const payload: Record<string, unknown> = {
      user_id: user.id,
      client_id: clientId,
      ru_name: ruName,
      environment,
      updated_at: new Date().toISOString(),
    };

    // Only touch client_secret if the user entered a new value — leaves the
    // existing encrypted secret untouched on edits that don't change it.
    if (clientSecret) {
      payload.client_secret = await encrypt(clientSecret, encryptionKey);
    }

    const { data: saved, error } = existing
      ? await adminClient.from("ebay_connections").update(payload).eq("id", existing.id)
        .select("id, client_id, ru_name, environment").single()
      : await adminClient.from("ebay_connections").upsert(payload, { onConflict: "user_id" })
        .select("id, client_id, ru_name, environment").single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, connection: saved }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("save-ebay-credentials error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "An internal error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
