-- Revoke direct access to printify_api_token from frontend clients
-- We use column-level grants: revoke all on organizations, then re-grant all columns EXCEPT printify_api_token

-- First revoke all privileges for anon and authenticated
REVOKE ALL ON public.organizations FROM anon, authenticated;

-- Re-grant SELECT on all columns except printify_api_token
GRANT SELECT (id, name, niche, tone, audience, brand_color, brand_font, brand_font_size, brand_style_notes, design_styles, enabled_marketplaces, logo_url, template_image_url, user_id, created_at, updated_at, deleted_at, printify_shop_id) ON public.organizations TO authenticated;

-- Re-grant INSERT, UPDATE, DELETE (RLS still controls row access)
GRANT INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
