
-- Restrict deleted_at column updates to owners only
-- Replace the editor update policy with one that excludes deleted_at by using a trigger
CREATE OR REPLACE FUNCTION public.protect_org_deleted_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the original owner can change deleted_at
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    IF OLD.user_id != auth.uid() THEN
      RAISE EXCEPTION 'Only the organization owner can soft-delete';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_org_deleted_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_org_deleted_at();
