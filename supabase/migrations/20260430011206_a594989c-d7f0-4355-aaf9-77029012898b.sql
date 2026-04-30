-- 1) Backfill: ensure every organization's creator is listed as an owner member
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT o.id, o.user_id, 'owner'::org_role
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = o.id AND m.user_id = o.user_id
)
ON CONFLICT DO NOTHING;

-- 2) Promote any existing non-owner row for the creator back to owner
UPDATE public.organization_members m
SET role = 'owner'::org_role
FROM public.organizations o
WHERE m.organization_id = o.id
  AND m.user_id = o.user_id
  AND m.role <> 'owner'::org_role;

-- 3) Trigger function: protect the creator's owner membership
CREATE OR REPLACE FUNCTION public.protect_org_creator_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _creator uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO _creator FROM public.organizations WHERE id = OLD.organization_id;
    IF _creator IS NOT NULL AND OLD.user_id = _creator THEN
      RAISE EXCEPTION 'Cannot remove the organization creator from members';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT user_id INTO _creator FROM public.organizations WHERE id = NEW.organization_id;
    IF _creator IS NOT NULL AND NEW.user_id = _creator AND NEW.role <> 'owner'::org_role THEN
      RAISE EXCEPTION 'Cannot demote the organization creator from owner';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_org_creator_membership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_org_creator_membership ON public.organization_members;
CREATE TRIGGER trg_protect_org_creator_membership
BEFORE UPDATE OR DELETE ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.protect_org_creator_membership();