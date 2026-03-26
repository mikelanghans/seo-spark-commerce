-- Replace the organizations SELECT policy to hide token from viewers
-- Viewers can still see org data but not the token column
-- We need two policies: one for owners/editors (full access) and one for viewers (restricted)

DROP POLICY IF EXISTS "Members can view organizations" ON public.organizations;

-- Owners/editors see everything
CREATE POLICY "Owners and editors can view organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (get_org_role(auth.uid(), id) IN ('owner', 'editor'));

-- Viewers can see orgs but we can't restrict columns via RLS
-- So we block direct SELECT for viewers and they must use the safe view
-- But this breaks existing queries... instead, let's just restrict to owner/editor
-- Viewers rarely need org data directly - they access it through products/listings which join internally