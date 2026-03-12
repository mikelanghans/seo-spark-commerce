
-- Drop the overly permissive policy and replace with a scoped one
DROP POLICY "Members can update invites" ON public.organization_invites;

CREATE POLICY "Accepting user or owner can update invites"
  ON public.organization_invites
  FOR UPDATE
  TO authenticated
  USING (
    is_org_member(auth.uid(), organization_id)
    OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  WITH CHECK (
    is_org_member(auth.uid(), organization_id)
    OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
