CREATE OR REPLACE FUNCTION public.deduct_user_credits(_user_id uuid, _amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current integer;
BEGIN
  SELECT credits INTO _current
  FROM public.user_credits
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND OR _current < _amount THEN
    RETURN false;
  END IF;

  UPDATE public.user_credits
  SET credits = credits - _amount, updated_at = now()
  WHERE user_id = _user_id;

  RETURN true;
END;
$$;