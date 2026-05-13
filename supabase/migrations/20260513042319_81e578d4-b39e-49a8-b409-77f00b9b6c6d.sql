-- Block client/browser reads of sensitive credential columns.
-- Edge functions use the service role key and are unaffected.

REVOKE SELECT (access_token, client_id, client_secret) ON public.shopify_connections FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token, client_secret) ON public.ebay_connections FROM authenticated, anon;
REVOKE SELECT (access_token, refresh_token, client_secret) ON public.etsy_connections FROM authenticated, anon;
REVOKE SELECT (access_token) ON public.meta_connections FROM authenticated, anon;