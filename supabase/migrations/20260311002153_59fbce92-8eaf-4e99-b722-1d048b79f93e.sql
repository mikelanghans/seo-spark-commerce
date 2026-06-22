
CREATE TABLE public.etsy_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shop_id text NOT NULL DEFAULT '',
  shop_name text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  access_token text DEFAULT '',
  refresh_token text DEFAULT '',
  token_expires_at timestamp with time zone DEFAULT null,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.etsy_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own etsy connection"
ON public.etsy_connections FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TABLE public.ebay_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id text NOT NULL DEFAULT '',
  client_secret text NOT NULL DEFAULT '',
  access_token text DEFAULT '',
  refresh_token text DEFAULT '',
  token_expires_at timestamp with time zone DEFAULT null,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ebay_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own ebay connection"
ON public.ebay_connections FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

ALTER TABLE public.products 
  ADD COLUMN etsy_listing_id text DEFAULT null,
  ADD COLUMN ebay_listing_id text DEFAULT null;
