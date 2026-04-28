import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extendAudit } from "../_shared/seo-audit.ts";

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

    const { scanId, url } = await req.json().catch(() => ({}));
    if (typeof scanId !== "string" || !/^[0-9a-f-]{36}$/i.test(scanId)) {
      return new Response(JSON.stringify({ error: "Invalid scanId" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    let targetUrl: string | undefined;
    if (typeof url === "string" && url.length > 0) {
      if (url.length > 2048) {
        return new Response(JSON.stringify({ error: "URL too long" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      try {
        const u = new URL(url);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad");
        targetUrl = u.toString();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid URL" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // RLS check via user-scoped client: must be able to see the scan (org member).
    const { data: scan, error: scanErr } = await supabase
      .from("seo_scans")
      .select("id, status")
      .eq("id", scanId)
      .maybeSingle();
    if (scanErr || !scan) {
      return new Response(JSON.stringify({ error: "Scan not found or access denied" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (scan.status === "running" || scan.status === "pending") {
      return new Response(JSON.stringify({ error: "Scan is still running" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const task = extendAudit(scanId);
    if (typeof (globalThis as any).EdgeRuntime !== "undefined" && (globalThis as any).EdgeRuntime.waitUntil) {
      (globalThis as any).EdgeRuntime.waitUntil(task);
    } else {
      task.catch((e) => console.error("extend audit task error:", e));
    }

    return new Response(JSON.stringify({ scanId, status: "extending" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("seo-extend-scan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
