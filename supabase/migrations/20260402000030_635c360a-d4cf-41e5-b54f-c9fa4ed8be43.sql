-- Tighten shopify_connections UPDATE policy to prevent user_id changes
-- and restrict organization_id changes to org owners
DROP POLICY IF EXISTS "Users can update own shopify connections" ON public.shopify_connections;

CREATE POLICY "Users can update own shopify connections"
ON public.shopify_connections
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND (
    organization_id IS NULL
    OR get_org_role(auth.uid(), organization_id) = 'owner'::org_role
  )
);