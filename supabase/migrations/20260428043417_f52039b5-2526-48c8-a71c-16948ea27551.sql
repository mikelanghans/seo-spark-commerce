-- SEO Scans table for the in-app SEO site audit module
CREATE TABLE public.seo_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  brand_aura_user_id uuid NOT NULL,
  root_url text NOT NULL,
  scope text NOT NULL DEFAULT 'standard' CHECK (scope IN ('quick','standard','deep')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','complete','error')),
  phase text NOT NULL DEFAULT 'queued' CHECK (phase IN ('queued','mapping','scanning','grading','complete','error')),
  pages_scanned integer NOT NULL DEFAULT 0,
  pages_total integer NOT NULL DEFAULT 0,
  discovered_url_count integer NOT NULL DEFAULT 0,
  report jsonb,
  error_message text,
  retry_scan_id uuid REFERENCES public.seo_scans(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_seo_scans_org_created ON public.seo_scans(organization_id, created_at DESC);
CREATE INDEX idx_seo_scans_status ON public.seo_scans(status) WHERE status IN ('pending','running');
CREATE INDEX idx_seo_scans_retry ON public.seo_scans(retry_scan_id) WHERE retry_scan_id IS NOT NULL;

ALTER TABLE public.seo_scans ENABLE ROW LEVEL SECURITY;

-- Members of the org can view scans
CREATE POLICY "Members can view seo scans"
ON public.seo_scans
FOR SELECT
TO authenticated
USING (is_org_member(auth.uid(), organization_id));

-- Editors/owners can insert scans (and must record themselves as the user)
CREATE POLICY "Editors can insert seo scans"
ON public.seo_scans
FOR INSERT
TO authenticated
WITH CHECK (
  brand_aura_user_id = auth.uid()
  AND get_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner'::org_role, 'editor'::org_role])
);

-- Editors/owners can update scans in their org (needed for retry linking from client; audit progress writes go via service role)
CREATE POLICY "Editors can update seo scans"
ON public.seo_scans
FOR UPDATE
TO authenticated
USING (get_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner'::org_role, 'editor'::org_role]))
WITH CHECK (get_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner'::org_role, 'editor'::org_role]));

-- Owners can delete scans
CREATE POLICY "Owners can delete seo scans"
ON public.seo_scans
FOR DELETE
TO authenticated
USING (get_org_role(auth.uid(), organization_id) = 'owner'::org_role);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_seo_scans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seo_scans_updated_at
BEFORE UPDATE ON public.seo_scans
FOR EACH ROW
EXECUTE FUNCTION public.touch_seo_scans_updated_at();