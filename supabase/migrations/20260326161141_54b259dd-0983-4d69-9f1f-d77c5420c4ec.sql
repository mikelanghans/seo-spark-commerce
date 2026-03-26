-- 1. Fix organization_invites: replace overly permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can read invite by token" ON public.organization_invites;

CREATE POLICY "Users can read own invites"
  ON public.organization_invites FOR SELECT
  TO authenticated
  USING (
    invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
    OR is_org_member(auth.uid(), organization_id)
  );

-- 2. Fix user_credits: remove self-service INSERT and UPDATE policies
DROP POLICY IF EXISTS "Users can insert own credits" ON public.user_credits;
DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;

-- 3. Create a secure function for credit operations
CREATE OR REPLACE FUNCTION public.add_user_credits(_user_id uuid, _delta integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, credits, updated_at)
  VALUES (_user_id, GREATEST(0, _delta), now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    credits = GREATEST(0, user_credits.credits + _delta),
    updated_at = now();
END;
$$;