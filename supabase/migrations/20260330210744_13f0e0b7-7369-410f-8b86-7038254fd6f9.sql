
-- Fix #1: ff_codes - replace public role policy with authenticated role
DROP POLICY IF EXISTS "Service role only" ON public.ff_codes;
CREATE POLICY "Block all access to ff_codes"
  ON public.ff_codes
  FOR ALL
  TO authenticated
  USING (false);

-- Fix #2: beta_access_codes - replace public role policy with authenticated role
DROP POLICY IF EXISTS "Service role only" ON public.beta_access_codes;
CREATE POLICY "Block all access to beta_access_codes"
  ON public.beta_access_codes
  FOR ALL
  TO authenticated
  USING (false);

-- Fix #3: organization_members - add restrictive INSERT policy to block non-owner self-insertion
CREATE POLICY "Only owners can insert members"
  ON public.organization_members
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_org_role(auth.uid(), organization_id) = 'owner'::org_role
  );
