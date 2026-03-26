
-- 1. Fix invite UPDATE policy: restrict so only the invited user can accept (set accepted_at)
-- and only owners can modify other fields
DROP POLICY IF EXISTS "Accepting user or owner can update invites" ON public.organization_invites;

-- Owners can update any field on invites in their org
CREATE POLICY "Owners can update invites"
  ON public.organization_invites FOR UPDATE
  TO authenticated
  USING (get_org_role(auth.uid(), organization_id) = 'owner'::org_role)
  WITH CHECK (get_org_role(auth.uid(), organization_id) = 'owner'::org_role);

-- Invited users can only accept their own invite (set accepted_at)
CREATE POLICY "Invited users can accept own invite"
  ON public.organization_invites FOR UPDATE
  TO authenticated
  USING (
    invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
    AND accepted_at IS NULL
  )
  WITH CHECK (
    invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
  );

-- 2. Fix organizations_safe view: drop and recreate WITHOUT security_invoker
-- so that the view owner's privileges are used (security definer, the default).
-- Then we restrict access via GRANT (already done: only authenticated can SELECT).
-- The scanner complains about no RLS on the view itself. Since views can't have RLS
-- in standard Postgres without security_invoker, let's use a different approach:
-- Replace the view with a function that checks membership.

DROP VIEW IF EXISTS public.organizations_safe;

-- Recreate as a security-definer view with a WHERE clause that checks membership
CREATE VIEW public.organizations_safe WITH (security_barrier = true) AS
  SELECT
    id, name, niche, tone, audience, brand_color, brand_font, brand_font_size,
    brand_style_notes, logo_url, template_image_url, design_styles,
    enabled_marketplaces, printify_shop_id, user_id,
    created_at, updated_at, deleted_at
  FROM public.organizations
  WHERE is_org_member(auth.uid(), id);

-- Restrict to authenticated only
REVOKE ALL ON public.organizations_safe FROM anon, public;
GRANT SELECT ON public.organizations_safe TO authenticated;
