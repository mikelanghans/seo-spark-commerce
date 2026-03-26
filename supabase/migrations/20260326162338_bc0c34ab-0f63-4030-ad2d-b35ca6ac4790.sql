
-- 1. Fix organizations_safe view: use security_invoker=true so it inherits organizations RLS
-- The view already has security_invoker=true but the scanner sees no explicit RLS.
-- We need to add a member-level SELECT policy on the organizations table for the view to work.
-- The current "Members can view organizations" policy should handle this.
-- Let's verify it exists and also add explicit member access.

-- Actually the issue is the scanner sees the view has no policies.
-- With security_invoker=true, the underlying table's RLS applies.
-- The organizations table has "Members can view organizations" SELECT policy.
-- So this should work. Let's dismiss this as a false positive since security_invoker=true
-- means the view delegates to the table's RLS.

-- But to be safe, let's also add a grants restriction:
REVOKE ALL ON public.organizations_safe FROM anon;
GRANT SELECT ON public.organizations_safe TO authenticated;

-- 2. Fix: the "Owners can manage organizations" ALL policy's USING clause doesn't cover INSERT.
-- The auto_add_org_owner trigger fires after INSERT, so user_id = auth.uid() is fine for INSERT.
-- Add explicit INSERT policy.
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
CREATE POLICY "Users can create organizations"
  ON public.organizations FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
