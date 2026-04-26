import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const { credits } = await req.json();
    if (!credits || typeof credits !== "number") throw new Error("Invalid credits amount");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Verify the user actually paid by checking recent checkout sessions
    const sessions = await stripe.checkout.sessions.list({
      limit: 5,
    });

    const validSession = sessions.data.find(
      (s) =>
        s.payment_status === "paid" &&
        s.metadata?.user_id === user.id &&
        s.metadata?.credits === String(credits)
    );

    if (!validSession) {
      throw new Error("No matching paid session found");
    }

    // Upsert credits
    const { data: existing } = await supabaseAdmin
      .from("user_credits")
      .select("credits")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from("user_credits")
        .update({ credits: existing.credits + credits, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
    } else {
      await supabaseAdmin
        .from("user_credits")
        .insert({ user_id: user.id, credits });
    }

    return new Response(JSON.stringify({ success: true, total: (existing?.credits ?? 0) + credits }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
