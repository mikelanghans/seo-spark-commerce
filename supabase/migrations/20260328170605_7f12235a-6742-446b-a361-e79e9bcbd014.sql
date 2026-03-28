
-- 1. user_credits: Explicitly block all writes from authenticated users (only service-role add_user_credits can write)
CREATE POLICY "Block direct inserts on user_credits"
ON public.user_credits
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Block direct updates on user_credits"
ON public.user_credits
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "Block direct deletes on user_credits"
ON public.user_credits
FOR DELETE
TO authenticated
USING (false);

-- 2. organization_members: Prevent non-owners from updating any membership row
CREATE POLICY "Only owners can update members"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (get_org_role(auth.uid(), organization_id) = 'owner'::org_role)
WITH CHECK (get_org_role(auth.uid(), organization_id) = 'owner'::org_role);

-- 3. OAuth secrets: Revoke SELECT on sensitive columns so they never reach the browser
REVOKE SELECT ON public.shopify_connections FROM anon, authenticated;
GRANT SELECT (id, user_id, store_domain, organization_id, created_at, updated_at) ON public.shopify_connections TO authenticated;

REVOKE SELECT ON public.ebay_connections FROM anon, authenticated;
GRANT SELECT (id, user_id, client_id, environment, created_at, updated_at) ON public.ebay_connections TO authenticated;
