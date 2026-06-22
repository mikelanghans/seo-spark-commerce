
-- AI usage tracking table
CREATE TABLE public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  function_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

-- Members can view their org's usage
CREATE POLICY "Members can view org usage" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

-- Authenticated users can insert their own usage logs
CREATE POLICY "Users can log own usage" ON public.ai_usage_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_org_member(auth.uid(), organization_id));

-- Index for fast monthly count queries
CREATE INDEX idx_ai_usage_log_org_month ON public.ai_usage_log (organization_id, created_at);
