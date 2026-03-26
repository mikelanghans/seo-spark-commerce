
-- 1. Move printify_api_token to a dedicated owner-only table
CREATE TABLE IF NOT EXISTS public.organization_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE,
  printify_api_token text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_secrets ENABLE ROW LEVEL SECURITY;

-- Only owners can read/write secrets
CREATE POLICY "Owners can manage org secrets"
  ON public.organization_secrets FOR ALL
  TO authenticated
  USING (get_org_role(auth.uid(), organization_id) = 'owner'::org_role)
  WITH CHECK (get_org_role(auth.uid(), organization_id) = 'owner'::org_role);

-- Migrate existing data
INSERT INTO public.organization_secrets (organization_id, printify_api_token)
  SELECT id, COALESCE(printify_api_token, '')
  FROM public.organizations
  WHERE printify_api_token IS NOT NULL AND printify_api_token != ''
ON CONFLICT (organization_id) DO NOTHING;

-- Remove printify_api_token from organizations table
ALTER TABLE public.organizations DROP COLUMN IF EXISTS printify_api_token;

-- Recreate organizations_safe view without the token column (it's gone now)
DROP VIEW IF EXISTS public.organizations_safe;
CREATE VIEW public.organizations_safe
  WITH (security_invoker = true)
AS
  SELECT id, name, niche, tone, audience, brand_color, brand_font, brand_font_size,
         brand_style_notes, logo_url, template_image_url, design_styles,
         enabled_marketplaces, printify_shop_id, user_id,
         created_at, updated_at, deleted_at
  FROM public.organizations;

-- 2. Revoke SELECT on sensitive shopify columns from authenticated, grant only non-sensitive ones
REVOKE SELECT ON public.shopify_connections FROM authenticated;
GRANT SELECT (id, user_id, organization_id, store_domain, created_at, updated_at)
  ON public.shopify_connections TO authenticated;

-- 3. Fix editor invite escalation: editors can only invite editor or viewer roles
DROP POLICY IF EXISTS "Editors and owners can create invites" ON public.organization_invites;

CREATE POLICY "Members can create invites with role limits"
  ON public.organization_invites FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN get_org_role(auth.uid(), organization_id) = 'owner'::org_role THEN true
      WHEN get_org_role(auth.uid(), organization_id) = 'editor'::org_role THEN role IN ('editor'::org_role, 'viewer'::org_role)
      ELSE false
    END
  );
