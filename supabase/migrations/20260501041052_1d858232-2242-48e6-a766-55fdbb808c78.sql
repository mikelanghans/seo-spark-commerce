ALTER TABLE public.etsy_connections
  ADD CONSTRAINT etsy_connections_user_id_key UNIQUE (user_id);