
-- Add unique constraint on (user_id, organization_id) to prevent duplicate memberships
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_user_org_unique UNIQUE (user_id, organization_id);

-- Tighten the invite join policy: also require the invite hasn't been accepted yet
DROP POLICY IF EXISTS "Users can join via valid invite" ON public.organization_members;

CREATE POLICY "Users can join via valid invite"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_invites
      WHERE organization_invites.organization_id = organization_members.organization_id
        AND organization_invites.accepted_at IS NULL
        AND organization_invites.invited_email = (SELECT email FROM auth.users WHERE id = auth.uid())::text
        AND organization_invites.role = organization_members.role
    )
  );
