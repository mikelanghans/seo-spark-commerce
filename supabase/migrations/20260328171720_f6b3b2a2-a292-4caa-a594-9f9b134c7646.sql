-- Remove the dangerous direct INSERT policy that allows privilege escalation.
-- The accept_invite() SECURITY DEFINER function handles joining safely.
DROP POLICY IF EXISTS "Users can join via valid invite" ON public.organization_members;

-- The "Owners can manage members" ALL policy already covers owner INSERT/DELETE.
-- Also remove the redundant "Only owners can update members" UPDATE policy
-- since the ALL policy already handles it.
DROP POLICY IF EXISTS "Only owners can update members" ON public.organization_members;