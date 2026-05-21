-- NexIssue eBay (and future) OAuth integrations (PRD §6, §9)
--
-- Goal: store per-org OAuth refresh + access tokens for marketplaces such as
-- eBay, encrypted at rest. The mobile client must be able to see *whether* an
-- integration is connected (provider, account label, scopes, connected_at) but
-- never the credential blob itself. All credential writes happen server-side
-- from edge functions running as the service role.
--
-- Strategy:
--   1. Keep the existing `credentials` jsonb column but revoke column-level
--      access from the `authenticated` role. Service-role bypasses RLS and
--      retains full access for edge functions to encrypt/decrypt at the
--      application layer (WebCrypto AES-GCM, key in Supabase secret).
--   2. Add a `metadata` jsonb column for non-secret display data
--      (eBay username, scopes, expires_at, environment) that the mobile app
--      can read directly via RLS.
--   3. Add an `oauth_states` table for short-lived CSRF state tokens issued
--      by `ebay-oauth-start` and consumed by `ebay-oauth-callback`. RLS is
--      enabled with NO authenticated policies → only service-role can touch
--      it.

-- ---------------------------------------------------------------------------
-- 1. org_integrations: add metadata, restrict credential column access
-- ---------------------------------------------------------------------------

ALTER TABLE public.org_integrations
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

REVOKE SELECT (credentials) ON public.org_integrations FROM authenticated;
REVOKE INSERT (credentials) ON public.org_integrations FROM authenticated;
REVOKE UPDATE (credentials) ON public.org_integrations FROM authenticated;

GRANT SELECT (
  id,
  org_id,
  provider,
  metadata,
  connected_at,
  last_used_at,
  created_at,
  updated_at
) ON public.org_integrations TO authenticated;

GRANT INSERT (
  id,
  org_id,
  provider,
  metadata
) ON public.org_integrations TO authenticated;

GRANT UPDATE (metadata) ON public.org_integrations TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. oauth_states: short-lived CSRF tokens for the OAuth round-trip
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL UNIQUE,
  provider public.integration_provider NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  return_scheme text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz
);

CREATE INDEX IF NOT EXISTS oauth_states_state_idx
  ON public.oauth_states (state);
CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx
  ON public.oauth_states (expires_at);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- No authenticated policies → only service-role can read/write. The
-- authenticated role never needs direct access; mobile only ever knows the
-- state via the URL returned from `ebay-oauth-start`.
REVOKE ALL ON public.oauth_states FROM authenticated;
