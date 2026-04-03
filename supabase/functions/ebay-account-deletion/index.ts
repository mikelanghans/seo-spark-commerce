import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const verificationToken = Deno.env.get("EBAY_DELETION_VERIFICATION_TOKEN");

    // eBay sends a challenge for endpoint validation
    if (req.method === "GET") {
      const url = new URL(req.url);
      const challengeCode = url.searchParams.get("challenge_code");

      if (!challengeCode) {
        return new Response(JSON.stringify({ error: "Missing challenge_code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // eBay expects: SHA-256 hash of challengeCode + verificationToken + endpoint URL
      const endpoint = url.origin + url.pathname;
      const toHash = challengeCode + verificationToken + endpoint;

      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(toHash));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const challengeResponse = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      return new Response(JSON.stringify({ challengeResponse }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: eBay sends account deletion/closure notifications
    if (req.method === "POST") {
      const body = await req.json();
      console.log("eBay account deletion notification received:", JSON.stringify(body));

      // eBay Marketplace Account Deletion notifications contain:
      // - metadata.topic: "MARKETPLACE_ACCOUNT_DELETION"
      // - notification.data.userId or notification.data.username
      const topic = body?.metadata?.topic;
      const userId = body?.notification?.data?.userId || body?.notification?.data?.username;

      console.log(`Topic: ${topic}, eBay User: ${userId}`);

      // Acknowledge receipt — eBay expects a 200 response
      // In production, you would delete/anonymize the user's data here
      // For now, we log it and acknowledge
      return new Response(JSON.stringify({ success: true, message: "Notification acknowledged" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ebay-account-deletion error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
