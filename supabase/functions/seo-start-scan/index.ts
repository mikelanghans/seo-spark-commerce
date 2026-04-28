import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runAudit, SCOPE_LIMITS } from "../_shared/seo-audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Per-user in-memory rate limit (best-effort; resets per cold start)
const RL = new Map<string, number[]>();
const MAX_PER_HOUR = 10;

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const arr = (RL.get(userId) || []).filter((t) => now - t < hour);
  if (arr.length >= MAX_PER_HOUR) { RL.set(userId, arr); return true; }
  arr.push(now); RL.set(userId, arr); return false;
}

function validUrl(s: unknown): s is string {
  if (typeof s !== "string" || s.length > 2048) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

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

    const body = await req.json().catch(() => ({}));
    const { rootUrl, scope, organizationId } = body || {};

    if (!validUrl(rootUrl)) {
      return new Response(JSON.stringify({ error: "Invalid rootUrl" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (typeof scope !== "string" || !(scope in SCOPE_LIMITS)) {
      return new Response(JSON.stringify({ error: "Invalid scope" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (typeof organizationId !== "string" || organizationId.length === 0) {
      return new Response(JSON.stringify({ error: "organizationId is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (rateLimited(userId)) {
      return new Response(JSON.stringify({ error: "Rate limit: max 10 scans per hour" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // RLS will reject if user is not editor/owner of the org — that's the authorization check.
    const { data: inserted, error: insErr } = await supabase
      .from("seo_scans")
      .insert({
        organization_id: organizationId,
        brand_aura_user_id: userId,
        root_url: rootUrl,
        scope,
        status: "pending",
        phase: "queued",
      })
      .select("id, root_url, scope, organization_id")
      .single();

    if (insErr || !inserted) {
      console.error("Insert seo_scan failed:", insErr);
      return new Response(JSON.stringify({ error: insErr?.message || "Failed to create scan" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Background audit
    const task = runAudit({ id: inserted.id, root_url: inserted.root_url, scope: inserted.scope as keyof typeof SCOPE_LIMITS, organization_id: inserted.organization_id });
    if (typeof (globalThis as any).EdgeRuntime !== "undefined" && (globalThis as any).EdgeRuntime.waitUntil) {
      (globalThis as any).EdgeRuntime.waitUntil(task);
    } else {
      task.catch((e) => console.error("audit task error:", e));
    }

    return new Response(JSON.stringify({ scanId: inserted.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seo-start-scan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
