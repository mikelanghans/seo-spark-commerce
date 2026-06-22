
-- Marketplace OAuth credentials: revoke column-level SELECT from clients
REVOKE SELECT (client_secret, access_token, refresh_token) ON public.ebay_connections FROM authenticated, anon;
REVOKE SELECT (client_secret, access_token, refresh_token, api_key) ON public.etsy_connections FROM authenticated, anon;
REVOKE SELECT (access_token) ON public.meta_connections FROM authenticated, anon;
REVOKE SELECT (client_secret, access_token) ON public.shopify_connections FROM authenticated, anon;

-- Re-assert printify token revoke (idempotent)
REVOKE SELECT (printify_api_token) ON public.organization_secrets FROM authenticated, anon;
