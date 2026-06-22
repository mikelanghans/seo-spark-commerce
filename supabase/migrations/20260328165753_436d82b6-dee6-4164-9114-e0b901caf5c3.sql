
-- 1. Fix support_tickets: enforce email matches authenticated user's email
DROP POLICY IF EXISTS "Users can insert own tickets" ON public.support_tickets;
CREATE POLICY "Users can insert own tickets"
ON public.support_tickets
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
);

-- 2. Create atomic invite acceptance function to prevent invite reuse and role escalation
CREATE OR REPLACE FUNCTION public.accept_invite(_invite_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite RECORD;
  _org_name text;
  _existing_member uuid;
BEGIN
  -- Lock and fetch the invite
  SELECT * INTO _invite
  FROM public.organization_invites
  WHERE invite_token = _invite_token
    AND accepted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or already used invite.');
  END IF;

  -- If invite has an email, verify it matches the caller
  IF _invite.invited_email IS NOT NULL THEN
    IF _invite.invited_email != (SELECT email FROM auth.users WHERE id = auth.uid())::text THEN
      RETURN jsonb_build_object('error', 'This invite was sent to a different email address.');
    END IF;
  END IF;

  -- Check if already a member
  SELECT id INTO _existing_member
  FROM public.organization_members
  WHERE organization_id = _invite.organization_id
    AND user_id = auth.uid();

  IF _existing_member IS NOT NULL THEN
    UPDATE public.organization_invites SET accepted_at = now() WHERE id = _invite.id;
    SELECT name INTO _org_name FROM public.organizations WHERE id = _invite.organization_id;
    RETURN jsonb_build_object('status', 'already_member', 'org_name', COALESCE(_org_name, 'this brand'));
  END IF;

  -- Insert member
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (_invite.organization_id, auth.uid(), _invite.role);

  -- Mark invite accepted
  UPDATE public.organization_invites SET accepted_at = now() WHERE id = _invite.id;

  SELECT name INTO _org_name FROM public.organizations WHERE id = _invite.organization_id;

  RETURN jsonb_build_object('status', 'joined', 'org_name', COALESCE(_org_name, 'this brand'), 'role', _invite.role::text);
END;
$$;
