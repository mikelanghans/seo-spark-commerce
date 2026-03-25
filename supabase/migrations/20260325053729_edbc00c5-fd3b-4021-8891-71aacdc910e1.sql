
CREATE TABLE public.beta_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  max_uses integer NOT NULL DEFAULT 50,
  current_uses integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.beta_access_codes ENABLE ROW LEVEL SECURITY;

-- Only service role can manage codes (admin use)
CREATE POLICY "Service role only" ON public.beta_access_codes FOR ALL TO public USING (false);

-- Create a security definer function to validate and consume a beta code
CREATE OR REPLACE FUNCTION public.validate_beta_code(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.beta_access_codes
  SET current_uses = current_uses + 1
  WHERE code = _code
    AND is_active = true
    AND current_uses < max_uses;
  RETURN FOUND;
END;
$$;

-- Insert a default beta code for testing
INSERT INTO public.beta_access_codes (code, max_uses) VALUES ('BRANDAURA-BETA-2026', 100);
