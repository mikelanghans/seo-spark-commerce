
-- Fix the broken RESTRICTIVE policy on organizations
-- The bug: o.id = o.id is always true (self-referential tautology)
-- The fix: correlate with the current row's id

DROP POLICY IF EXISTS "Prevent user_id change on update" ON organizations;
CREATE POLICY "Prevent user_id change on update"
  ON organizations
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  WITH CHECK (
    user_id = (SELECT o.user_id FROM organizations o WHERE o.id = organizations.id)
  );
