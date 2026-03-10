
-- Update organizations: members can view orgs they belong to, editors can update
DROP POLICY IF EXISTS "Users can manage own organizations" ON public.organizations;

CREATE POLICY "Owners can manage organizations"
  ON public.organizations FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members can view organizations"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), id));

CREATE POLICY "Editors can update organizations"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (public.get_org_role(auth.uid(), id) IN ('editor', 'owner'))
  WITH CHECK (public.get_org_role(auth.uid(), id) IN ('editor', 'owner'));

-- Update products: members can view, editors can manage
DROP POLICY IF EXISTS "Users can manage own products" ON public.products;

CREATE POLICY "Members can view products"
  ON public.products FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Editors can manage products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.get_org_role(auth.uid(), organization_id) IN ('owner', 'editor'));

CREATE POLICY "Editors can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.get_org_role(auth.uid(), organization_id) IN ('owner', 'editor'))
  WITH CHECK (public.get_org_role(auth.uid(), organization_id) IN ('owner', 'editor'));

CREATE POLICY "Owners can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.get_org_role(auth.uid(), organization_id) = 'owner' OR user_id = auth.uid());

-- Update generated_messages
DROP POLICY IF EXISTS "Users can manage own messages" ON public.generated_messages;

CREATE POLICY "Members can view messages"
  ON public.generated_messages FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Editors can manage messages"
  ON public.generated_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.get_org_role(auth.uid(), organization_id) IN ('owner', 'editor'));

CREATE POLICY "Editors can update messages"
  ON public.generated_messages FOR UPDATE
  TO authenticated
  USING (public.get_org_role(auth.uid(), organization_id) IN ('owner', 'editor'))
  WITH CHECK (public.get_org_role(auth.uid(), organization_id) IN ('owner', 'editor'));

CREATE POLICY "Editors can delete messages"
  ON public.generated_messages FOR DELETE
  TO authenticated
  USING (public.get_org_role(auth.uid(), organization_id) IN ('owner', 'editor'));

-- Update design_feedback
DROP POLICY IF EXISTS "Users can manage own feedback" ON public.design_feedback;

CREATE POLICY "Members can view feedback"
  ON public.design_feedback FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Members can manage own feedback"
  ON public.design_feedback FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Users can update own feedback"
  ON public.design_feedback FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own feedback"
  ON public.design_feedback FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Update product_images
DROP POLICY IF EXISTS "Users can manage own product images" ON public.product_images;

CREATE POLICY "Members can view product images"
  ON public.product_images FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND public.is_org_member(auth.uid(), p.organization_id)
    )
  );

CREATE POLICY "Editors can manage product images"
  ON public.product_images FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND public.get_org_role(auth.uid(), p.organization_id) IN ('owner', 'editor')
    )
  );

CREATE POLICY "Editors can update product images"
  ON public.product_images FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND public.get_org_role(auth.uid(), p.organization_id) IN ('owner', 'editor')
    )
  );

CREATE POLICY "Editors can delete product images"
  ON public.product_images FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND public.get_org_role(auth.uid(), p.organization_id) IN ('owner', 'editor')
    )
  );

-- Update listings
DROP POLICY IF EXISTS "Users can manage own listings" ON public.listings;

CREATE POLICY "Members can view listings"
  ON public.listings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND public.is_org_member(auth.uid(), p.organization_id)
    )
  );

CREATE POLICY "Editors can manage listings"
  ON public.listings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND public.get_org_role(auth.uid(), p.organization_id) IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND public.get_org_role(auth.uid(), p.organization_id) IN ('owner', 'editor')
    )
  );
