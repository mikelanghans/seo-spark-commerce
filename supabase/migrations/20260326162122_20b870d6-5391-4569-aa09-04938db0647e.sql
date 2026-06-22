
-- 1. Fix organizations: owner-only SELECT (hides printify_api_token from editors)
DROP POLICY IF EXISTS "Owners and editors can view organizations" ON public.organizations;

CREATE POLICY "Owners can view organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (get_org_role(auth.uid(), id) = 'owner'::org_role);

-- Editors need non-sensitive org data, so create a viewer-safe policy using the safe view instead.
-- But editors still need SELECT for UPDATE policy to work. We keep owner-only for direct table access.
-- Editors/viewers use organizations_safe view.

-- 2. Fix shopify_connections: owner-only SELECT (remove editor access to tokens)
DROP POLICY IF EXISTS "Owners and editors can view shopify connections" ON public.shopify_connections;

CREATE POLICY "Owners can view shopify connections"
  ON public.shopify_connections FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 3. Fix organizations_safe view: recreate with security_invoker = true
DROP VIEW IF EXISTS public.organizations_safe;

CREATE VIEW public.organizations_safe
  WITH (security_invoker = true)
AS
  SELECT
    id, name, niche, tone, audience, brand_color, brand_font, brand_font_size,
    brand_style_notes, logo_url, template_image_url, design_styles,
    enabled_marketplaces, printify_shop_id, user_id,
    created_at, updated_at, deleted_at
  FROM public.organizations;

-- Add RLS-like access: since security_invoker=true, the organizations table's
-- own RLS policies will apply. But we need editors/viewers to read org data
-- through this view. So we need a SELECT policy on organizations for members.
-- Let's add a member-level SELECT policy that only works through the safe view approach:

-- Actually with security_invoker=true, the view respects the underlying table's RLS.
-- So we need a broader SELECT on organizations but without the token column exposed.
-- The solution: allow members to SELECT organizations (RLS), but revoke column-level access to printify_api_token.

-- Better approach: keep owner-only on organizations table, and for the safe view
-- use security_invoker=false (default/definer) so it bypasses organizations RLS,
-- then add RLS directly on the view for members.

-- Let's redo: use security_barrier + RLS on the view itself
DROP VIEW IF EXISTS public.organizations_safe;

CREATE VIEW public.organizations_safe AS
  SELECT
    id, name, niche, tone, audience, brand_color, brand_font, brand_font_size,
    brand_style_notes, logo_url, template_image_url, design_styles,
    enabled_marketplaces, printify_shop_id, user_id,
    created_at, updated_at, deleted_at
  FROM public.organizations;

-- Enable RLS on the view (Postgres 15+ supports this on views)
-- Actually, Supabase uses Postgres and RLS on views requires security_invoker.
-- The cleanest approach: use security_invoker=true + add a member SELECT policy on organizations.

DROP VIEW IF EXISTS public.organizations_safe;

CREATE VIEW public.organizations_safe
  WITH (security_invoker = true)
AS
  SELECT
    id, name, niche, tone, audience, brand_color, brand_font, brand_font_size,
    brand_style_notes, logo_url, template_image_url, design_styles,
    enabled_marketplaces, printify_shop_id, user_id,
    created_at, updated_at, deleted_at
  FROM public.organizations;

-- Now we need members (including editors/viewers) to be able to read via the safe view.
-- Since security_invoker=true uses the caller's permissions against the organizations table,
-- we need a member-level SELECT policy on organizations.
-- But we want to hide printify_api_token. We can't do column-level RLS in Postgres.
-- 
-- Solution: Use REVOKE + GRANT at column level.
-- Revoke SELECT on the token column from authenticated role, grant on all other columns.

-- First ensure the policy allows members to SELECT organizations
DROP POLICY IF EXISTS "Owners can view organizations" ON public.organizations;

CREATE POLICY "Members can view organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), id));

-- Now use column-level privileges to hide the token
REVOKE SELECT ON public.organizations FROM authenticated;

GRANT SELECT (
  id, name, niche, tone, audience, brand_color, brand_font, brand_font_size,
  brand_style_notes, logo_url, template_image_url, design_styles,
  enabled_marketplaces, printify_shop_id, user_id,
  created_at, updated_at, deleted_at
) ON public.organizations TO authenticated;

-- Owners who need the token should use edge functions with service_role key
