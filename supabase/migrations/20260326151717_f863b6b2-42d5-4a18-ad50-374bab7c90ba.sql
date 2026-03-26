
REVOKE ALL ON public.shopify_connections FROM anon, authenticated;
GRANT SELECT (id, store_domain, client_id, organization_id, user_id, created_at, updated_at) ON public.shopify_connections TO authenticated;
GRANT INSERT (id, store_domain, client_id, organization_id, user_id, created_at, updated_at) ON public.shopify_connections TO authenticated;
GRANT UPDATE (id, store_domain, client_id, organization_id, user_id, updated_at) ON public.shopify_connections TO authenticated;
GRANT DELETE ON public.shopify_connections TO authenticated;
