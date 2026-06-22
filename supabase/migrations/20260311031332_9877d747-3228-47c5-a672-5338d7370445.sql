-- Link orphaned generated_messages to their products
UPDATE public.generated_messages gm
SET product_id = p.id
FROM public.products p
WHERE gm.product_id IS NULL
  AND p.description = gm.message_text
  AND p.organization_id = gm.organization_id
  AND p.user_id = gm.user_id;