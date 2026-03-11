CREATE POLICY "Editors can update social posts"
ON public.social_posts
FOR UPDATE
TO authenticated
USING (get_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner'::org_role, 'editor'::org_role]))
WITH CHECK (get_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner'::org_role, 'editor'::org_role]));