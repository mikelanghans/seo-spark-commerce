
-- Block all client-side INSERT/UPDATE/DELETE on ff_redemptions
-- Redemptions are managed exclusively via the redeem-ff-code edge function (service role)
CREATE POLICY "Block client insert on ff_redemptions"
  ON public.ff_redemptions
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block anon insert on ff_redemptions"
  ON public.ff_redemptions
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE POLICY "Block client update on ff_redemptions"
  ON public.ff_redemptions
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "Block anon update on ff_redemptions"
  ON public.ff_redemptions
  FOR UPDATE
  TO anon
  USING (false);

CREATE POLICY "Block client delete on ff_redemptions"
  ON public.ff_redemptions
  FOR DELETE
  TO authenticated
  USING (false);

CREATE POLICY "Block anon delete on ff_redemptions"
  ON public.ff_redemptions
  FOR DELETE
  TO anon
  USING (false);
