-- 1. Fix organizations_safe view: remove printify_api_token entirely
DROP VIEW IF EXISTS public.organizations_safe;

CREATE VIEW public.organizations_safe
WITH (security_invoker = on) AS
  SELECT id, name, niche, audience, tone, brand_color, brand_font, brand_font_size,
         brand_style_notes, design_styles, enabled_marketplaces, logo_url, template_image_url,
         user_id, created_at, updated_at, deleted_at, printify_shop_id
  FROM public.organizations;

-- 2. Fix org member invite policy: don't trust user-supplied role, enforce invite's role
DROP POLICY IF EXISTS "Users can join via valid invite" ON public.organization_members;

CREATE POLICY "Users can join via valid invite"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_invites
      WHERE organization_invites.organization_id = organization_members.organization_id
        AND organization_invites.accepted_at IS NULL
        AND organization_invites.invited_email IS NOT NULL
        AND organization_invites.invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
        AND organization_invites.role = organization_members.role
    )
  );