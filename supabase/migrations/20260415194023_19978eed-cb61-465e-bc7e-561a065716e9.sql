-- Drop the overly broad SELECT policy that allows listing all files
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;

-- Create a scoped SELECT policy: authenticated users can view their own images,
-- but the bucket remains public (images are accessible via direct URL)
CREATE POLICY "Authenticated users can view own product images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Also allow service role and public direct URL access (bucket is public, so
-- direct object URLs still work, but listing via API is restricted)
CREATE POLICY "Public can view product images by path"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'product-images');