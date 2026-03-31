
ALTER TABLE public.organizations
ADD COLUMN mockup_templates jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organizations.mockup_templates IS 'Per-product-type mockup template image URLs, keyed by ProductTypeKey';
