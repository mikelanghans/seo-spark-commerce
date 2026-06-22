
CREATE TABLE public.mockup_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  product_image_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rating text NOT NULL DEFAULT 'neutral',
  size_feedback text DEFAULT NULL,
  color_accuracy text DEFAULT NULL,
  notes text DEFAULT '',
  color_name text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mockup_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view mockup feedback"
  ON public.mockup_feedback FOR SELECT
  TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Editors can insert mockup feedback"
  ON public.mockup_feedback FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND get_org_role(auth.uid(), organization_id) IN ('owner', 'editor')
  );

CREATE POLICY "Users can update own feedback"
  ON public.mockup_feedback FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own feedback"
  ON public.mockup_feedback FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
