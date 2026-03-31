import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { imageUrl, fileName, base64Contents, organizationId } = await req.json();
    if (!imageUrl && !base64Contents) throw new Error("imageUrl or base64Contents is required");

    // Try org-level token first, then fall back to env var
    let printifyToken = Deno.env.get("PRINTIFY_API_TOKEN");
    if (organizationId) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: secrets } = await adminClient
        .from("organization_secrets")
        .select("printify_api_token")
        .eq("organization_id", organizationId)
        .single();
      if (secrets?.printify_api_token) printifyToken = secrets.printify_api_token;
    }

    if (!printifyToken) {
      return new Response(JSON.stringify({ error: "Printify API token not configured. Add your token in Settings → Marketplace." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let uploadBody: any;
    if (base64Contents) {
      uploadBody = {
        file_name: fileName || "design.png",
        contents: base64Contents,
      };
    } else {
      uploadBody = {
        file_name: fileName || "design.png",
        url: imageUrl,
      };
    }

    const res = await fetch("https://api.printify.com/v1/uploads/images.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${printifyToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(uploadBody),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Printify upload error (${res.status}): ${text}`);
    }

    const image = await res.json();

    return new Response(JSON.stringify({ image, trimmed: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("printify-upload-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
