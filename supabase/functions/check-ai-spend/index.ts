import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Estimated cost per AI action (USD) — conservative estimates
 * based on Gemini / GPT pricing for typical prompt sizes.
 */
const ESTIMATED_COST_USD: Record<string, number> = {
  "analyze-product": 0.002,
  "recommend-colors": 0.002,
  "suggest-pricing": 0.002,
  "check-listing-health": 0.002,
  "generate-social-posts": 0.003,
  "generate-messages": 0.004,
  "generate-listings": 0.004,
  "generate-color-variants": 0.01,
  "generate-design": 0.025,
  "generate-dark-design": 0.01,
  "generate-mockup": 0.02,
  "generate-social-image": 0.02,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth gate: require either a valid CRON_SECRET (for scheduled runs)
    // or an authenticated admin user.
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedCron = req.headers.get("x-cron-secret");
    const isCron = !!cronSecret && providedCron === cronSecret;

    if (!isCron) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAdmin } = await adminClient.rpc("has_role", {
        _user_id: userData.user.id,
        _role: "admin",
      });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 1. Get the threshold settings
    const { data: setting } = await adminClient
      .from("admin_settings")
      .select("value")
      .eq("key", "ai_spend_threshold")
      .single();

    if (!setting) {
      return new Response(JSON.stringify({ skipped: true, reason: "No threshold configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const monthlyLimit = setting.value.monthly_limit ?? 0.75;
    const notifyAtPct = setting.value.notify_at_pct ?? 80;
    const thresholdUsd = monthlyLimit * (notifyAtPct / 100);

    // 2. Get AI usage for current month
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const { data: usageLogs } = await adminClient
      .from("ai_usage_log")
      .select("function_name")
      .gte("created_at", startOfMonth.toISOString());

    if (!usageLogs || usageLogs.length === 0) {
      return new Response(JSON.stringify({ 
        estimated_spend: 0, 
        threshold: thresholdUsd, 
        limit: monthlyLimit,
        status: "ok" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Calculate estimated spend
    let estimatedSpend = 0;
    for (const log of usageLogs) {
      estimatedSpend += ESTIMATED_COST_USD[log.function_name] ?? 0.003;
    }

    console.log(`Estimated AI spend this month: $${estimatedSpend.toFixed(4)} / threshold: $${thresholdUsd.toFixed(2)} / limit: $${monthlyLimit.toFixed(2)}`);

    const status = estimatedSpend >= monthlyLimit ? "exceeded" 
                 : estimatedSpend >= thresholdUsd ? "warning" 
                 : "ok";

    // 4. Send notification if at or above warning threshold
    if (status === "warning" || status === "exceeded") {
      // Find admin users to notify
      const { data: adminRoles } = await adminClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (adminRoles && adminRoles.length > 0) {
        // Check if we already sent a notification this month to avoid spam
        const { data: existingNotif } = await adminClient
          .from("notifications")
          .select("id")
          .eq("type", "ai_spend_warning")
          .gte("created_at", startOfMonth.toISOString())
          .limit(1);

        if (!existingNotif || existingNotif.length === 0) {
          const pct = Math.round((estimatedSpend / monthlyLimit) * 100);
          const title = status === "exceeded"
            ? "⚠️ AI Spend Limit Exceeded"
            : "⚡ AI Spend Approaching Limit";
          const message = status === "exceeded"
            ? `Estimated Cloud AI spend ($${estimatedSpend.toFixed(2)}) has exceeded your $${monthlyLimit.toFixed(2)} monthly limit. Top up your Lovable Cloud AI balance to prevent service interruption.`
            : `Estimated Cloud AI spend ($${estimatedSpend.toFixed(2)}) has reached ${pct}% of your $${monthlyLimit.toFixed(2)} monthly limit. Consider topping up soon.`;

          for (const admin of adminRoles) {
            await adminClient.from("notifications").insert({
              user_id: admin.user_id,
              title,
              message,
              type: "ai_spend_warning",
            });
          }
          console.log(`Sent spend warning notification to ${adminRoles.length} admin(s)`);
        } else {
          console.log("Spend warning already sent this month, skipping");
        }
      }
    }

    return new Response(JSON.stringify({
      estimated_spend: Math.round(estimatedSpend * 10000) / 10000,
      threshold: thresholdUsd,
      limit: monthlyLimit,
      total_calls: usageLogs.length,
      status,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-ai-spend error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
