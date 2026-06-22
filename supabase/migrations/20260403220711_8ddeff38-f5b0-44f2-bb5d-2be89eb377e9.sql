
-- Drop the overly broad policy
DROP POLICY IF EXISTS "Org members can view invites" ON public.organization_invites;

-- Replace with owner/editor-only visibility
CREATE POLICY "Owners and editors can view invites"
  ON public.organization_invites FOR SELECT TO authenticated
  USING (
    get_org_role(auth.uid(), organization_id) IN ('owner', 'editor')
  );
