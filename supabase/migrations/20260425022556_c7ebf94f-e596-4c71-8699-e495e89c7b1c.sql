-- Tighten organization_invites SELECT to prevent viewer-role members from
-- reading invited_email of all pending invites. Owners/editors keep full
-- access via the existing "Owners and editors can view invites" policy.
DROP POLICY IF EXISTS "Users can read own invites" ON public.organization_invites;

CREATE POLICY "Users can read invites addressed to them"
ON public.organization_invites
FOR SELECT
TO authenticated
USING (
  invited_email IS NOT NULL
  AND invited_email = ((SELECT email FROM auth.users WHERE id = auth.uid()))::text
);