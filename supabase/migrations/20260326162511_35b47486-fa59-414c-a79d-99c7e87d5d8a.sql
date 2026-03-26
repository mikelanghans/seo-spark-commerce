
DROP VIEW IF EXISTS public.organizations_safe;

CREATE VIEW public.organizations_safe
  WITH (security_invoker = true, security_barrier = true)
AS
  SELECT
    id, name, niche, tone, audience, brand_color, brand_font, brand_font_size,
    brand_style_notes, logo_url, template_image_url, design_styles,
    enabled_marketplaces, printify_shop_id, user_id,
    created_at, updated_at, deleted_at
  FROM public.organizations;

REVOKE ALL ON public.organizations_safe FROM anon, public;
GRANT SELECT ON public.organizations_safe TO authenticated;
