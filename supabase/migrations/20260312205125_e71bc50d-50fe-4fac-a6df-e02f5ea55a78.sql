
-- Attach the existing auto_add_org_owner function as a trigger
CREATE TRIGGER trg_auto_add_org_owner
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_add_org_owner();

-- Backfill: ensure every org creator is an owner in organization_members
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT o.id, o.user_id, 'owner'::org_role
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = o.id AND m.user_id = o.user_id
)
ON CONFLICT DO NOTHING;

-- Add UPDATE policy on organization_invites so invites can be marked as accepted
CREATE POLICY "Members can update invites"
  ON public.organization_invites
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
