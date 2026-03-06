
DROP POLICY IF EXISTS "Users can manage own products" ON public.products;
CREATE POLICY "Users can manage own products" ON public.products FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own organizations" ON public.organizations;
CREATE POLICY "Users can manage own organizations" ON public.organizations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own listings" ON public.listings;
CREATE POLICY "Users can manage own listings" ON public.listings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
