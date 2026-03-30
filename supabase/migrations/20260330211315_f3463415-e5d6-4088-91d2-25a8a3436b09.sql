
-- Fix #1: Support ticket tier spoofing
-- Create a function to look up user tier server-side
CREATE OR REPLACE FUNCTION public.get_user_tier(_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tier text := 'free';
  _is_admin boolean;
  _is_ff boolean;
BEGIN
  -- Check if admin
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
  ) INTO _is_admin;
  IF _is_admin THEN RETURN 'pro'; END IF;

  -- Check FF redemption
  SELECT EXISTS (
    SELECT 1 FROM public.ff_redemptions WHERE user_id = _user_id
  ) INTO _is_ff;
  IF _is_ff THEN
    SELECT COALESCE(tier, 'pro') INTO _tier FROM public.ff_redemptions WHERE user_id = _user_id LIMIT 1;
    RETURN _tier;
  END IF;

  -- Default to free (Stripe subscription check happens in edge function, 
  -- but for RLS purposes free is the safe default)
  RETURN 'free';
END;
$$;

-- Create trigger to force tier on insert
CREATE OR REPLACE FUNCTION public.set_support_ticket_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.tier := get_user_tier(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_support_ticket_tier
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_ticket_tier();

-- Fix #2: Realtime channel authorization for notifications
-- Remove notifications from realtime publication to prevent channel snooping
-- (RLS on the table protects data, but channel subscriptions themselves are open)
ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
