-- Idempotency log for Stripe checkout sessions
CREATE TABLE IF NOT EXISTS public.processed_stripe_sessions (
  session_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  credits integer NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.processed_stripe_sessions ENABLE ROW LEVEL SECURITY;

-- Block all client access; only service role (which bypasses RLS) can read/write.
CREATE POLICY "Block client access to processed_stripe_sessions"
ON public.processed_stripe_sessions
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- Tighten organization_members insert: owners can only add viewer/editor directly.
-- The original creator is still set as owner via the auto_add_org_owner trigger.
DROP POLICY IF EXISTS "Owners can insert members" ON public.organization_members;

CREATE POLICY "Owners can insert non-owner members"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  get_org_role(auth.uid(), organization_id) = 'owner'::org_role
  AND role <> 'owner'::org_role
);

-- Tighten updates too: owners can change roles but cannot create another owner.
DROP POLICY IF EXISTS "Owners can update members" ON public.organization_members;

CREATE POLICY "Owners can update non-owner members"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (get_org_role(auth.uid(), organization_id) = 'owner'::org_role)
WITH CHECK (
  get_org_role(auth.uid(), organization_id) = 'owner'::org_role
  AND role <> 'owner'::org_role
);