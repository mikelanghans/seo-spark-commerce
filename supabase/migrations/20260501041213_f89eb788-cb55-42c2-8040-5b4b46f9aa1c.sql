-- Grant standard table privileges; client_secret SELECT remains revoked
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etsy_connections TO authenticated;
REVOKE SELECT (client_secret) ON public.etsy_connections FROM authenticated, anon;