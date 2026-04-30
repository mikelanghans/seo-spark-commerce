import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Credit costs per AI action.
 * Image generation is most expensive; text-only analysis is cheapest.
 */
export const CREDIT_COSTS: Record<string, number> = {
  "analyze-product": 1,
  "recommend-colors": 1,
  "suggest-pricing": 1,
  "check-listing-health": 1,
  "suggest-keywords-tags": 1,
  "generate-social-posts": 1,
  "generate-messages": 2,
  "generate-listings": 2,
  "generate-color-variants": 2,   // per color
  "generate-design": 5,
  "generate-dark-design": 3,
  "generate-mockup": 3,
  "generate-social-image": 3,
};

const TIER_LIMITS: Record<string, number> = {
  free: 25,
  starter: 175,
  pro: 700,
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Extracts user ID from the Authorization header.
 * Returns null if the token is invalid or missing.
 */
export async function getUserIdFromAuth(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Deducts credits for the given function. Returns true if successful.
 *
 * Logic:
 * 1. Check user's subscription tier → get monthly allowance
 * 2. Count this month's AI usage from ai_usage_log
 * 3. If within subscription allowance → allow (no purchased credit deduction)
 * 4. If subscription exhausted → deduct from purchased credits via atomic RPC
 */
export async function deductCredits(
  userId: string,
  functionName: string,
  multiplier = 1
): Promise<boolean> {
  const cost = (CREDIT_COSTS[functionName] || 1) * multiplier;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // 1. Get user tier
  const { data: tier } = await supabase.rpc("get_user_tier", { _user_id: userId });
  const subscriptionLimit = TIER_LIMITS[tier || "free"] || 25;

  // 2. Count this month's usage
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: usageCount } = await supabase
    .from("ai_usage_log")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfMonth.toISOString());

  const used = usageCount ?? 0;
  const subscriptionRemaining = Math.max(0, subscriptionLimit - used);

  // 3. If within subscription allowance, allow without deducting purchased credits
  if (subscriptionRemaining >= cost) {
    return true;
  }

  // 4. Need purchased credits for the overflow (or full cost if subscription exhausted)
  const neededFromPurchased = cost - subscriptionRemaining;

  const { data, error } = await supabase.rpc("deduct_user_credits", {
    _user_id: userId,
    _amount: neededFromPurchased,
  });

  if (error) {
    console.error("Credit deduction error:", error);
    return false;
  }

  return data === true;
}

/**
 * Returns a 402 response for insufficient credits.
 */
export function insufficientCreditsResponse(functionName: string) {
  const cost = CREDIT_COSTS[functionName] || 1;
  return new Response(
    JSON.stringify({
      error: `Insufficient credits. This action requires ${cost} credit${cost > 1 ? "s" : ""}. Please purchase more credits in Settings.`,
      code: "CREDITS_EXHAUSTED",
    }),
    {
      status: 402,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}
