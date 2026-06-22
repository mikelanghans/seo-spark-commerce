
-- Block anon role on ff_codes
CREATE POLICY "Block anon access to ff_codes"
  ON public.ff_codes
  FOR ALL
  TO anon
  USING (false);

-- Block anon role on beta_access_codes
CREATE POLICY "Block anon access to beta_access_codes"
  ON public.beta_access_codes
  FOR ALL
  TO anon
  USING (false);
