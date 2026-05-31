-- Extend price_history for eBay sold comps (Finding API) + per-row metadata.

ALTER TABLE public.price_history
  DROP CONSTRAINT IF EXISTS price_history_source_check;

ALTER TABLE public.price_history
  ADD CONSTRAINT price_history_source_check
  CHECK (source IN ('gocollect', 'ebay', 'ebay_sold'));

ALTER TABLE public.price_history
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS price_history_comic_source_idx
  ON public.price_history (comic_id, source);
