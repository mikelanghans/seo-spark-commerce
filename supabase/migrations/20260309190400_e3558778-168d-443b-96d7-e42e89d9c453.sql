ALTER TABLE public.shopify_connections 
ADD COLUMN client_id TEXT,
ADD COLUMN client_secret TEXT,
ALTER COLUMN access_token DROP NOT NULL,
ALTER COLUMN access_token SET DEFAULT '';