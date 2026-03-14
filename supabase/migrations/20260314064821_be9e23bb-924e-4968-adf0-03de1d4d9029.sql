
-- Add organization_id to shopify_connections
ALTER TABLE public.shopify_connections ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Users can manage own shopify_connection" ON public.shopify_connections;
DROP POLICY IF EXISTS "Users can manage own shopify connection" ON public.shopify_connections;

-- New RLS: org members can view, owners/editors can manage
CREATE POLICY "Members can view shopify connections"
ON public.shopify_connections
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR 
  (organization_id IS NOT NULL AND is_org_member(auth.uid(), organization_id))
);

CREATE POLICY "Users can insert shopify connections"
ON public.shopify_connections
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own shopify connections"
ON public.shopify_connections
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own shopify connections"
ON public.shopify_connections
FOR DELETE
TO authenticated
USING (user_id = auth.uid());
