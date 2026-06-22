-- Re-assert: product-images bucket is LIST-private (no anon enumeration)
-- but remains publicly READable via direct CDN URLs (bucket.public = true).

-- Ensure no anonymous SELECT policy exists on storage.objects for this bucket
DROP POLICY IF EXISTS "Public can view product images by path" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;

-- Keep bucket public so direct /object/public/product-images/... URLs work
-- for marketplace integrations (Shopify, Printify, Etsy, eBay).
UPDATE storage.buckets SET public = true WHERE id = 'product-images';