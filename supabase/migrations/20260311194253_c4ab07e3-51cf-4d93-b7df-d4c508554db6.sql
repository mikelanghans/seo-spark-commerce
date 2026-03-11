
CREATE TABLE public.design_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  design_url TEXT NOT NULL,
  feedback_notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL
);

ALTER TABLE public.design_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view design history"
  ON public.design_history FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "Editors can insert design history"
  ON public.design_history FOR INSERT TO authenticated
  WITH CHECK (get_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner'::org_role, 'editor'::org_role]));

CREATE INDEX idx_design_history_message_id ON public.design_history(message_id);
