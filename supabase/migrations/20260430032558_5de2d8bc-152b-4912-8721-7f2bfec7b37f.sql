-- Update is_org_member and get_org_role to exclude soft-deleted organizations
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.user_id = _user_id
      AND om.organization_id = _org_id
      AND o.deleted_at IS NULL
  )
$function$;

CREATE OR REPLACE FUNCTION public.get_org_role(_user_id uuid, _org_id uuid)
 RETURNS org_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT om.role
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = _user_id
    AND om.organization_id = _org_id
    AND o.deleted_at IS NULL
$function$;