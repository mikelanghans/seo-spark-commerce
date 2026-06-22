
-- Meta connections table
CREATE TABLE public.meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  catalog_id text NOT NULL DEFAULT '',
  access_token text NOT NULL DEFAULT '',
  page_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own meta connection"
  ON public.meta_connections FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add meta_listing_id to products
ALTER TABLE public.products ADD COLUMN meta_listing_id text DEFAULT NULL;
