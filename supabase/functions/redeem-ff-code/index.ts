import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // Auth user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user) throw new Error("Not authenticated");

    const { code } = await req.json();
    if (!code || typeof code !== "string") throw new Error("Invalid code");

    // Check if already redeemed
    const { data: existing } = await supabaseAdmin
      .from("ff_redemptions")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) throw new Error("You have already redeemed a code");

    // Find the code
    const { data: ffCode } = await supabaseAdmin
      .from("ff_codes")
      .select("*")
      .eq("code", code.trim().toLowerCase())
      .maybeSingle();
    if (!ffCode) throw new Error("Invalid invite code");
    if (ffCode.current_uses >= ffCode.max_uses) throw new Error("This code has reached its limit");

    // Redeem
    await supabaseAdmin.from("ff_redemptions").insert({
      user_id: user.id,
      code_id: ffCode.id,
      tier: ffCode.tier,
    });

    await supabaseAdmin
      .from("ff_codes")
      .update({ current_uses: ffCode.current_uses + 1 })
      .eq("id", ffCode.id);

    return new Response(JSON.stringify({ success: true, tier: ffCode.tier }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
