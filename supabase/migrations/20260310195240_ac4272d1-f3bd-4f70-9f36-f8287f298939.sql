
-- Enum for organization member roles
CREATE TYPE public.org_role AS ENUM ('owner', 'editor', 'viewer');

-- Organization members table
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Organization invites table
CREATE TABLE public.organization_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_email text,
  invite_token uuid NOT NULL DEFAULT gen_random_uuid(),
  role org_role NOT NULL DEFAULT 'editor',
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(invite_token)
);

ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- Security definer function to check org membership
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id
  )
$$;

-- Security definer function to check org role
CREATE OR REPLACE FUNCTION public.get_org_role(_user_id uuid, _org_id uuid)
RETURNS org_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.organization_members
  WHERE user_id = _user_id AND organization_id = _org_id
$$;

-- RLS for organization_members: members can see their org's members
CREATE POLICY "Members can view org members"
  ON public.organization_members FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

-- Only owners/editors can invite (insert members)
CREATE POLICY "Owners can manage members"
  ON public.organization_members FOR ALL
  TO authenticated
  USING (public.get_org_role(auth.uid(), organization_id) = 'owner')
  WITH CHECK (public.get_org_role(auth.uid(), organization_id) = 'owner');

-- Allow users to insert themselves (for accepting invites)
CREATE POLICY "Users can join via invite"
  ON public.organization_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- RLS for organization_invites
CREATE POLICY "Org members can view invites"
  ON public.organization_invites FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Editors and owners can create invites"
  ON public.organization_invites FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_org_role(auth.uid(), organization_id) IN ('owner', 'editor')
  );

CREATE POLICY "Owners can delete invites"
  ON public.organization_invites FOR DELETE
  TO authenticated
  USING (public.get_org_role(auth.uid(), organization_id) = 'owner');

-- Anyone can read invite by token (for acceptance)
CREATE POLICY "Anyone can read invite by token"
  ON public.organization_invites FOR SELECT
  TO authenticated
  USING (true);

-- Seed existing org owners into organization_members
INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT id, user_id, 'owner'::org_role FROM public.organizations
ON CONFLICT DO NOTHING;

-- Trigger to auto-add owner when org is created
CREATE OR REPLACE FUNCTION public.auto_add_org_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (NEW.id, NEW.user_id, 'owner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_org_created
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_org_owner();
