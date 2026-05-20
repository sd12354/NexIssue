-- Per-user rate limiting for cert-lookup edge function (30 req/min).
-- No RLS policies: only service_role (edge functions) should access this table.

CREATE TABLE public.cert_lookup_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

COMMENT ON TABLE public.cert_lookup_rate_limits IS
  'Sliding-window counters for cert-lookup; managed by edge function only.';

ALTER TABLE public.cert_lookup_rate_limits ENABLE ROW LEVEL SECURITY;
