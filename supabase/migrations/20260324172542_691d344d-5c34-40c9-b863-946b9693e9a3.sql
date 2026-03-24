CREATE TABLE public.user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX user_credits_user_id_idx ON public.user_credits (user_id);

CREATE POLICY "Users can view own credits"
  ON public.user_credits FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own credits"
  ON public.user_credits FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own credits"
  ON public.user_credits FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());