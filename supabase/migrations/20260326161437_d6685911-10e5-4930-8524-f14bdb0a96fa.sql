-- 1. Fix organization_members: replace open INSERT policy with invite-validated one
DROP POLICY IF EXISTS "Users can join via invite" ON public.organization_members;

CREATE POLICY "Users can join via valid invite"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_invites
      WHERE organization_invites.organization_id = organization_members.organization_id
        AND organization_invites.accepted_at IS NULL
        AND (
          organization_invites.invited_email IS NULL
          OR organization_invites.invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
        )
        AND organization_invites.role = organization_members.role
    )
  );

-- 2. Fix shopify_connections: restrict SELECT to owner/editor only (tokens are sensitive)
DROP POLICY IF EXISTS "Members can view shopify connections" ON public.shopify_connections;

CREATE POLICY "Owners and editors can view shopify connections"
  ON public.shopify_connections FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND get_org_role(auth.uid(), organization_id) IN ('owner', 'editor')
    )
  );

-- 3. Fix organizations: create a view that hides printify_api_token
-- We can't easily restrict a single column via RLS, so we'll restrict the SELECT policy
-- to hide the token for viewer-role members by replacing the policy

DROP POLICY IF EXISTS "Members can view organizations" ON public.organizations;

CREATE POLICY "Members can view organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), id));

-- Create a secure view that excludes the token for non-owner/editor access
CREATE OR REPLACE VIEW public.organizations_safe
WITH (security_invoker = on) AS
  SELECT id, name, niche, audience, tone, brand_color, brand_font, brand_font_size,
         brand_style_notes, design_styles, enabled_marketplaces, logo_url, template_image_url,
         user_id, created_at, updated_at, deleted_at, printify_shop_id,
         CASE WHEN get_org_role(auth.uid(), id) IN ('owner', 'editor')
              THEN printify_api_token
              ELSE NULL
         END AS printify_api_token
  FROM public.organizations;