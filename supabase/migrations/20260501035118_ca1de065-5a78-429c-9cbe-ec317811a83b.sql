-- Update is_org_member to also include organization owners (organizations.user_id)
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizations o
    WHERE o.id = _org_id
      AND o.deleted_at IS NULL
      AND (
        o.user_id = _user_id
        OR EXISTS (
          SELECT 1 FROM public.organization_members om
          WHERE om.organization_id = o.id
            AND om.user_id = _user_id
        )
      )
  )
$function$;

-- Update get_org_role to return 'owner' for organizations.user_id even if no membership row exists
CREATE OR REPLACE FUNCTION public.get_org_role(_user_id uuid, _org_id uuid)
RETURNS org_role
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role org_role;
  _is_creator boolean;
BEGIN
  SELECT (o.user_id = _user_id) INTO _is_creator
  FROM public.organizations o
  WHERE o.id = _org_id AND o.deleted_at IS NULL;

  IF _is_creator THEN
    RETURN 'owner'::org_role;
  END IF;

  SELECT om.role INTO _role
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = _user_id
    AND om.organization_id = _org_id
    AND o.deleted_at IS NULL;

  RETURN _role;
END;
$function$;