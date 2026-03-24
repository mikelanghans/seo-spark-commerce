
CREATE TABLE public.ff_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  max_uses integer NOT NULL DEFAULT 50,
  current_uses integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'pro',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ff_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON public.ff_codes FOR ALL USING (false);

CREATE TABLE public.ff_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_id uuid REFERENCES public.ff_codes(id) ON DELETE CASCADE NOT NULL,
  tier text NOT NULL DEFAULT 'pro',
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.ff_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redemption" ON public.ff_redemptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
