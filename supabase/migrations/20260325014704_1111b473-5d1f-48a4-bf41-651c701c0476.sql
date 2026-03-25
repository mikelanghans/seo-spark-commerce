
CREATE TABLE public.listing_refresh_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  sales_current integer NOT NULL DEFAULT 0,
  sales_previous integer NOT NULL DEFAULT 0,
  velocity_drop_pct numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  new_listing_id uuid REFERENCES public.listings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE(product_id, status)
);

ALTER TABLE public.listing_refresh_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view refresh queue"
  ON public.listing_refresh_queue FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Editors can manage refresh queue"
  ON public.listing_refresh_queue FOR ALL TO authenticated
  USING (get_org_role(auth.uid(), organization_id) IN ('owner', 'editor'))
  WITH CHECK (get_org_role(auth.uid(), organization_id) IN ('owner', 'editor'));
