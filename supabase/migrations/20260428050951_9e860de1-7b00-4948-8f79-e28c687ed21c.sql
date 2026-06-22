-- Remove the anonymous SELECT policy on product-images.
-- The bucket remains public=true, so direct CDN URLs
-- (/storage/v1/object/public/product-images/...) continue to work
-- for Shopify, Printify, Etsy, and <img> embeds. Removing this policy
-- prevents anonymous users from listing/enumerating files via the
-- storage REST API.
DROP POLICY IF EXISTS "Public can view product images by path" ON storage.objects;