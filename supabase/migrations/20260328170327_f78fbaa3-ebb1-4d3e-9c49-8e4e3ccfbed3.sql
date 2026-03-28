
-- Remove the vulnerable "Invited users can accept own invite" UPDATE policy
-- The atomic accept_invite() RPC now handles invite acceptance securely
DROP POLICY IF EXISTS "Invited users can accept own invite" ON public.organization_invites;
