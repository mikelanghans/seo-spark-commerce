-- 1) Simplify organization_members policies to remove dual-policy confusion
DROP POLICY IF EXISTS "Owners can manage members" ON public.organization_members;
DROP POLICY IF EXISTS "Only owners can insert members" ON public.organization_members;

-- Recreate explicit, single per-command policies (owner-only for write ops)
CREATE POLICY "Owners can insert members"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (public.get_org_role(auth.uid(), organization_id) = 'owner'::org_role);

CREATE POLICY "Owners can update members"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (public.get_org_role(auth.uid(), organization_id) = 'owner'::org_role)
WITH CHECK (public.get_org_role(auth.uid(), organization_id) = 'owner'::org_role);

CREATE POLICY "Owners can delete members"
ON public.organization_members
FOR DELETE
TO authenticated
USING (public.get_org_role(auth.uid(), organization_id) = 'owner'::org_role);

-- 2) Lock down EXECUTE on SECURITY DEFINER functions

-- Trigger-only functions: revoke from all PostgREST roles
REVOKE ALL ON FUNCTION public.touch_seo_scans_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_add_org_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_org_deleted_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_support_ticket_tier() FROM PUBLIC, anon, authenticated;

-- Internal helpers used by RLS: revoke from anon, keep authenticated (RLS evaluates as the calling role)
REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_org_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_tier(uuid) FROM PUBLIC, anon;

-- Privileged operations: revoke direct execution from clients (called only via edge functions / service role)
REVOKE ALL ON FUNCTION public.deduct_user_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_user_credits(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_beta_code(text) FROM PUBLIC, anon, authenticated;

-- accept_invite is intentionally callable by signed-in users (used in AcceptInvite page)
REVOKE ALL ON FUNCTION public.accept_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invite(uuid) TO authenticated;