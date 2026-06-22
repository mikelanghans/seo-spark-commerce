
-- Restore table-level access (RLS still enforces row-level restrictions)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ebay_connections TO authenticated;
GRANT SELECT ON public.ebay_connections TO anon;

-- Revoke SELECT on sensitive credential columns from client roles
REVOKE SELECT (access_token, refresh_token, client_secret) ON public.ebay_connections FROM authenticated;
REVOKE SELECT (access_token, refresh_token, client_secret) ON public.ebay_connections FROM anon;
