-- Fix 1: Remove duplicate auto_add_org_owner trigger
DROP TRIGGER IF EXISTS on_org_created ON public.organizations;

-- Fix 2: Re-apply column-level REVOKE on Shopify credential columns
REVOKE SELECT (client_secret) ON public.shopify_connections FROM anon, authenticated;
REVOKE SELECT (client_id) ON public.shopify_connections FROM anon, authenticated;
REVOKE SELECT (access_token) ON public.shopify_connections FROM anon, authenticated;