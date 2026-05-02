CREATE OR REPLACE FUNCTION public.redeem_ff_code_atomic(_user_id uuid, _code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code_row RECORD;
  _existing uuid;
BEGIN
  SELECT id INTO _existing FROM public.ff_redemptions WHERE user_id = _user_id LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'You have already redeemed a code');
  END IF;

  UPDATE public.ff_codes
  SET current_uses = current_uses + 1
  WHERE code = lower(trim(_code))
    AND current_uses < max_uses
  RETURNING id, tier INTO _code_row;

  IF _code_row.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid invite code or limit reached');
  END IF;

  INSERT INTO public.ff_redemptions (user_id, code_id, tier)
  VALUES (_user_id, _code_row.id, _code_row.tier);

  RETURN jsonb_build_object('success', true, 'tier', _code_row.tier);
END;
$$;