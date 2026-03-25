
CREATE TABLE public.ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'running',
  winner_variant text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  test_duration_days integer NOT NULL DEFAULT 14,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ab_test_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  variant_label text NOT NULL DEFAULT 'A',
  listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  tags jsonb NOT NULL DEFAULT '[]',
  seo_title text NOT NULL DEFAULT '',
  seo_description text NOT NULL DEFAULT '',
  url_handle text NOT NULL DEFAULT '',
  alt_text text NOT NULL DEFAULT '',
  sales_count integer NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  views integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_test_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view ab tests"
  ON public.ab_tests FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Editors can manage ab tests"
  ON public.ab_tests FOR ALL TO authenticated
  USING (get_org_role(auth.uid(), organization_id) IN ('owner', 'editor'))
  WITH CHECK (get_org_role(auth.uid(), organization_id) IN ('owner', 'editor'));

CREATE POLICY "Members can view ab test variants"
  ON public.ab_test_variants FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ab_tests t
    WHERE t.id = ab_test_variants.test_id
    AND is_org_member(auth.uid(), t.organization_id)
  ));

CREATE POLICY "Editors can manage ab test variants"
  ON public.ab_test_variants FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ab_tests t
    WHERE t.id = ab_test_variants.test_id
    AND get_org_role(auth.uid(), t.organization_id) IN ('owner', 'editor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ab_tests t
    WHERE t.id = ab_test_variants.test_id
    AND get_org_role(auth.uid(), t.organization_id) IN ('owner', 'editor')
  ));
