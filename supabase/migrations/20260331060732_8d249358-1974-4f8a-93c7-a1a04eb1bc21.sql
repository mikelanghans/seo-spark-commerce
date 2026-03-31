
-- Prevent editors from changing user_id or deleted_at on organizations
-- Add a RESTRICTIVE policy that ensures user_id cannot be changed
CREATE POLICY "Prevent user_id change on update"
ON public.organizations
AS RESTRICTIVE
FOR UPDATE
TO authenticated
WITH CHECK (
  user_id = (SELECT o.user_id FROM public.organizations o WHERE o.id = id)
);
