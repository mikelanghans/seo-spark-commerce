
-- Fix shopify_connections UPDATE policy to prevent organization_id reassignment to unauthorized orgs
DROP POLICY IF EXISTS "Users can update own shopify connections" ON public.shopify_connections;
CREATE POLICY "Users can update own shopify connections"
ON public.shopify_connections
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND (organization_id IS NULL OR is_org_member(auth.uid(), organization_id)));
