import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runAudit, SCOPE_LIMITS } from "../_shared/seo-audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub;

    const { scanId } = await req.json().catch(() => ({}));
    if (typeof scanId !== "string" || !/^[0-9a-f-]{36}$/i.test(scanId)) {
      return new Response(JSON.stringify({ error: "Invalid scanId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find tail of retry chain (most recent retry)
    const { data: original, error: origErr } = await supabase
      .from("seo_scans")
      .select("id, organization_id, root_url, scope, retry_scan_id")
      .eq("id", scanId)
      .maybeSingle();
    if (origErr || !original) {
      return new Response(JSON.stringify({ error: "Scan not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Walk to the latest retry in the chain
    let tail = original;
    const seen = new Set<string>([tail.id]);
    while (tail.retry_scan_id) {
      const { data: next } = await supabase
        .from("seo_scans")
        .select("id, organization_id, root_url, scope, retry_scan_id")
        .eq("id", tail.retry_scan_id)
        .maybeSingle();
      if (!next || seen.has(next.id)) break;
      seen.add(next.id);
      tail = next;
    }

    // Insert new scan (RLS verifies editor/owner)
    const { data: created, error: insErr } = await supabase
      .from("seo_scans")
      .insert({
        organization_id: original.organization_id,
        brand_aura_user_id: userId,
        root_url: original.root_url,
        scope: original.scope,
        status: "pending",
        phase: "queued",
      })
      .select("id, root_url, scope")
      .single();
    if (insErr || !created) {
      return new Response(JSON.stringify({ error: insErr?.message || "Failed to create retry" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Link tail.retry_scan_id → created.id
    const { error: linkErr } = await supabase
      .from("seo_scans")
      .update({ retry_scan_id: created.id })
      .eq("id", tail.id);
    if (linkErr) console.error("Failed to link retry chain:", linkErr);

    const task = runAudit({ id: created.id, root_url: created.root_url, scope: created.scope as keyof typeof SCOPE_LIMITS });
    if (typeof (globalThis as any).EdgeRuntime !== "undefined" && (globalThis as any).EdgeRuntime.waitUntil) {
      (globalThis as any).EdgeRuntime.waitUntil(task);
    } else {
      task.catch((e) => console.error("audit task error:", e));
    }

    return new Response(JSON.stringify({ scanId: created.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("seo-retry-scan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
