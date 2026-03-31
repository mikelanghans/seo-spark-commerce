
-- Revoke direct SELECT on sensitive credential columns from client-facing roles.
-- Edge functions using the service role are unaffected.
REVOKE SELECT (access_token, client_id, client_secret) ON public.shopify_connections FROM anon, authenticated;
