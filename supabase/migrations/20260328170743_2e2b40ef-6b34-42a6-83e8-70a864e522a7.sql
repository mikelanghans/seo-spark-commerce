
-- etsy_connections: hide api_key, access_token, refresh_token
REVOKE SELECT ON public.etsy_connections FROM anon, authenticated;
GRANT SELECT (id, user_id, shop_id, shop_name, created_at, updated_at, token_expires_at) ON public.etsy_connections TO authenticated;

-- meta_connections: hide access_token
REVOKE SELECT ON public.meta_connections FROM anon, authenticated;
GRANT SELECT (id, user_id, catalog_id, page_id, created_at, updated_at) ON public.meta_connections TO authenticated;

-- organization_secrets: hide printify_api_token
REVOKE SELECT ON public.organization_secrets FROM anon, authenticated;
GRANT SELECT (id, organization_id, created_at, updated_at) ON public.organization_secrets TO authenticated;
