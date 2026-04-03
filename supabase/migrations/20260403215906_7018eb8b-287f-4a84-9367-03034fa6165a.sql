
-- Admin settings table for configurable platform settings
CREATE TABLE public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only admins can read/write
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage settings"
  ON public.admin_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed the default AI spend threshold ($0.75)
INSERT INTO public.admin_settings (key, value)
VALUES ('ai_spend_threshold', '{"monthly_limit": 0.75, "notify_at_pct": 80}'::jsonb);
