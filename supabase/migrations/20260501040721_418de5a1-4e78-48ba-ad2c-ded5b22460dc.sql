ALTER TABLE public.etsy_connections
  ADD COLUMN IF NOT EXISTS client_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_secret text NOT NULL DEFAULT '';

REVOKE SELECT (client_secret) ON public.etsy_connections FROM authenticated, anon;