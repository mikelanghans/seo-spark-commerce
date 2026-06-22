
CREATE TABLE public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  error_message text NOT NULL DEFAULT '',
  error_stack text DEFAULT '',
  error_source text NOT NULL DEFAULT 'unknown',
  page_url text DEFAULT '',
  user_agent text DEFAULT '',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own error logs"
  ON public.error_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view own error logs"
  ON public.error_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());
