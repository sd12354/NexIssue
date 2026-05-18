-- NexIssue initial schema (PRD Section 8)
-- Multi-tenant via org_id + RLS; personal org created on auth signup.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

CREATE TYPE public.plan_tier AS ENUM ('free', 'pro', 'dealer');

CREATE TYPE public.org_member_role AS ENUM ('owner', 'admin', 'helper');

CREATE TYPE public.comic_status AS ENUM (
  'in_inventory',
  'listed',
  'sold',
  'gifted'
);

CREATE TYPE public.listing_status AS ENUM (
  'draft',
  'pending_review',
  'published',
  'sold',
  'ended'
);

CREATE TYPE public.integration_provider AS ENUM ('ebay', 'shippo', 'gocollect');

-- ---------------------------------------------------------------------------
-- Utility: updated_at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  plan public.plan_tier NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended'))
);

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);

CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.org_member_role NOT NULL,
  invited_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE TABLE public.org_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.org_member_role NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.org_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  provider public.integration_provider NOT NULL,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider)
);

CREATE TABLE public.comics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  cert_number text NOT NULL,
  grader text NOT NULL CHECK (grader IN ('CGC', 'CBCS')),
  title text,
  issue text,
  variant text,
  year integer,
  grade numeric(4, 1),
  key_notes text[] NOT NULL DEFAULT '{}',
  encapsulation_date date,
  acquired_at timestamptz,
  acquired_cost numeric(12, 2),
  acquired_source text,
  status public.comic_status NOT NULL DEFAULT 'in_inventory',
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, cert_number)
);

CREATE TABLE public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  comic_id uuid NOT NULL REFERENCES public.comics (id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  position text NOT NULL CHECK (position IN ('front', 'back', 'slab', 'other')),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  comic_id uuid NOT NULL REFERENCES public.comics (id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('gocollect', 'ebay')),
  price numeric(12, 2) NOT NULL,
  sale_date date,
  grade_matched boolean,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  comic_id uuid NOT NULL REFERENCES public.comics (id) ON DELETE CASCADE,
  marketplace text NOT NULL DEFAULT 'ebay',
  marketplace_listing_id text,
  status public.listing_status NOT NULL DEFAULT 'draft',
  asking_price numeric(12, 2),
  title text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.listings (id) ON DELETE CASCADE,
  sold_price numeric(12, 2) NOT NULL,
  sold_at timestamptz NOT NULL DEFAULT now(),
  buyer_id_external text,
  shippo_label_id text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.listing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  action text NOT NULL CHECK (action IN ('auto_publish', 'require_review')),
  price_formula text,
  priority integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.advisor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL DEFAULT now(),
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS helper (SECURITY DEFINER avoids org_members policy recursion)
-- Must be created after org_members table exists.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX comics_org_id_status_idx ON public.comics (org_id, status);
CREATE INDEX comics_cert_number_idx ON public.comics (cert_number);
CREATE INDEX listings_org_id_status_idx ON public.listings (org_id, status);
CREATE INDEX sales_org_id_sold_at_idx ON public.sales (org_id, sold_at);
CREATE INDEX price_history_comic_id_fetched_at_idx
  ON public.price_history (comic_id, fetched_at DESC);

CREATE INDEX org_members_user_id_idx ON public.org_members (user_id);
CREATE INDEX org_invitations_org_id_idx ON public.org_invitations (org_id);
CREATE INDEX photos_comic_id_idx ON public.photos (comic_id);
CREATE INDEX listings_comic_id_idx ON public.listings (comic_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_org_members_updated_at
  BEFORE UPDATE ON public.org_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_org_invitations_updated_at
  BEFORE UPDATE ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_org_integrations_updated_at
  BEFORE UPDATE ON public.org_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_comics_updated_at
  BEFORE UPDATE ON public.comics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_photos_updated_at
  BEFORE UPDATE ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_price_history_updated_at
  BEFORE UPDATE ON public.price_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_sales_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_listing_rules_updated_at
  BEFORE UPDATE ON public.listing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_advisor_runs_updated_at
  BEFORE UPDATE ON public.advisor_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth signup: profile + personal organization
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  display_name text;
BEGIN
  display_name := coalesce(
    nullif(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);

  INSERT INTO public.organizations (name, created_by, plan, status)
  VALUES (display_name || '''s Organization', NEW.id, 'free', 'active')
  RETURNING id INTO new_org_id;

  INSERT INTO public.org_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advisor_runs ENABLE ROW LEVEL SECURITY;

-- organizations (tenant root — no org_id column)
CREATE POLICY organizations_select ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(id));

CREATE POLICY organizations_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_member(id))
  WITH CHECK (public.is_org_member(id));

-- users (profile table — no org_id column)
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR id IN (
      SELECT om.user_id
      FROM public.org_members om
      WHERE public.is_org_member(om.org_id)
    )
  );

CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- org-scoped tables (PRD pattern via is_org_member)
CREATE POLICY org_members_select ON public.org_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY org_members_insert ON public.org_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY org_members_update ON public.org_members
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY org_members_delete ON public.org_members
  FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY org_invitations_select ON public.org_invitations
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY org_invitations_insert ON public.org_invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY org_invitations_update ON public.org_invitations
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY org_invitations_delete ON public.org_invitations
  FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY org_integrations_select ON public.org_integrations
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY org_integrations_insert ON public.org_integrations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY org_integrations_update ON public.org_integrations
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY org_integrations_delete ON public.org_integrations
  FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY comics_select ON public.comics
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY comics_insert ON public.comics
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY comics_update ON public.comics
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY comics_delete ON public.comics
  FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY photos_select ON public.photos
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY photos_insert ON public.photos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY photos_update ON public.photos
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY photos_delete ON public.photos
  FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY price_history_select ON public.price_history
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY price_history_insert ON public.price_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY price_history_update ON public.price_history
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY price_history_delete ON public.price_history
  FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY listings_select ON public.listings
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY listings_insert ON public.listings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY listings_update ON public.listings
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY listings_delete ON public.listings
  FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY sales_select ON public.sales
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY sales_insert ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY sales_update ON public.sales
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY sales_delete ON public.sales
  FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY listing_rules_select ON public.listing_rules
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY listing_rules_insert ON public.listing_rules
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY listing_rules_update ON public.listing_rules
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY listing_rules_delete ON public.listing_rules
  FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY advisor_runs_select ON public.advisor_runs
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY advisor_runs_insert ON public.advisor_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY advisor_runs_update ON public.advisor_runs
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY advisor_runs_delete ON public.advisor_runs
  FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
