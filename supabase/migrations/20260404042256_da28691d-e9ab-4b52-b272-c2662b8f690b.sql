ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS print_placement jsonb;

COMMENT ON COLUMN public.products.print_placement IS 'Saved print placement settings for marketplace pushes, including scale and offsets from the placement editor.';