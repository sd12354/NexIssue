-- Phase 4: Shippo fulfillment — presets, shipping from address, sales tracking, push tokens, label storage.

-- ---------------------------------------------------------------------------
-- org_shipping_presets
-- ---------------------------------------------------------------------------

CREATE TABLE public.org_shipping_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  length numeric NOT NULL,
  width numeric NOT NULL,
  height numeric NOT NULL,
  weight numeric NOT NULL,
  distance_unit text NOT NULL DEFAULT 'in',
  mass_unit text NOT NULL DEFAULT 'oz',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX org_shipping_presets_one_default_per_org_idx
  ON public.org_shipping_presets (org_id)
  WHERE is_default = true;

CREATE INDEX org_shipping_presets_org_id_idx
  ON public.org_shipping_presets (org_id);

ALTER TABLE public.org_shipping_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_shipping_presets_select ON public.org_shipping_presets
  FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY org_shipping_presets_insert ON public.org_shipping_presets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY org_shipping_presets_update ON public.org_shipping_presets
  FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY org_shipping_presets_delete ON public.org_shipping_presets
  FOR DELETE TO authenticated
  USING (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------
-- organizations.shipping_from
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS shipping_from jsonb;

COMMENT ON COLUMN public.organizations.shipping_from IS
  'Ship-from address for label generation: { name, street1, street2?, city, state, zip, country, phone }';

-- ---------------------------------------------------------------------------
-- sales — fulfillment tracking columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS buyer_address jsonb,
  ADD COLUMN IF NOT EXISTS buyer_username text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS tracking_status text,
  ADD COLUMN IF NOT EXISTS estimated_delivery timestamptz,
  ADD COLUMN IF NOT EXISTS label_storage_path text,
  ADD COLUMN IF NOT EXISTS shippo_label_cost numeric(12, 2),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_label';

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_status_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_status_check
  CHECK (status IN ('pending_label', 'label_created', 'shipped', 'delivered'));

CREATE INDEX sales_tracking_number_idx ON public.sales (tracking_number)
  WHERE tracking_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- push_tokens (Expo push for org members)
-- ---------------------------------------------------------------------------

CREATE TABLE public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, expo_push_token)
);

CREATE INDEX push_tokens_org_id_idx ON public.push_tokens (org_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_tokens_select ON public.push_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY push_tokens_insert ON public.push_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

CREATE POLICY push_tokens_update ON public.push_tokens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(org_id));

CREATE POLICY push_tokens_delete ON public.push_tokens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Default preset seed helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_org_shipping_presets(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.org_shipping_presets WHERE org_id = p_org_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.org_shipping_presets (
    org_id, name, length, width, height, weight, is_default
  ) VALUES
    (p_org_id, 'Single CGC Slab', 8, 6.5, 1.5, 12, true),
    (p_org_id, 'Two Slabs', 8, 6.5, 2.5, 20, false);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_org_shipping_presets(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_org_shipping_presets(uuid) TO authenticated;

-- Backfill existing orgs
SELECT public.seed_org_shipping_presets(id) FROM public.organizations;

-- Extend signup trigger to seed presets for new orgs
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

  PERFORM public.seed_org_shipping_presets(new_org_id);

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Storage bucket: shipping-labels
-- Path: {org_id}/labels/{sale_id}.pdf
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shipping-labels',
  'shipping-labels',
  false,
  10 * 1024 * 1024,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.shipping_label_org(path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN split_part(path, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN split_part(path, '/', 1)::uuid
      ELSE NULL
    END;
$$;

CREATE POLICY shipping_labels_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'shipping-labels'
    AND public.is_org_member(public.shipping_label_org(name))
  );
