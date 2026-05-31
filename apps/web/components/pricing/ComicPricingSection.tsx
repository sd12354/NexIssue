"use client";

import {
  bandsFromHistory,
  chartPointsFromHistory,
  isPricingStale,
  listPriceHistory,
  PricingError,
  refreshPricing,
  type PriceHistoryRow,
  type SourcePriceBands,
} from "@app/api";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getSupabase } from "@/lib/supabase";
import { PriceBandCard } from "./PriceBandCard";
import { PriceChart } from "./PriceChart";

type ComicPricingSectionProps = {
  comicId: string;
  orgId: string;
};

const emptyBands = (source: "gocollect" | "ebay"): SourcePriceBands => ({
  source,
  compsStored: 0,
  low30: null,
  median30: null,
  high30: null,
  count30: 0,
  low60: null,
  median60: null,
  high60: null,
  count60: 0,
  low90: null,
  median90: null,
  high90: null,
  count90: 0,
  lastSalePrice: null,
  lastSaleDate: null,
});

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "never";
  const elapsed = Date.now() - Date.parse(iso);
  if (elapsed < 60_000) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ComicPricingSection({
  comicId,
  orgId,
}: ComicPricingSectionProps) {
  const [history, setHistory] = useState<PriceHistoryRow[]>([]);
  const [soldBands, setSoldBands] = useState<SourcePriceBands>(
    emptyBands("gocollect"),
  );
  const [activeBands, setActiveBands] = useState<SourcePriceBands>(
    emptyBands("ebay"),
  );
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chartPoints = useMemo(
    () => chartPointsFromHistory(history, 180),
    [history],
  );

  const applyHistory = useCallback((rows: PriceHistoryRow[]) => {
    setHistory(rows);
    setSoldBands(bandsFromHistory(rows, "gocollect"));
    setActiveBands(bandsFromHistory(rows, "ebay"));
    const latest = rows.reduce<string | null>(
      (acc, row) => (!acc || row.fetched_at > acc ? row.fetched_at : acc),
      null,
    );
    setFetchedAt(latest);
  }, []);

  const runRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const result = await refreshPricing(getSupabase(), comicId);
      setSoldBands(result.sold);
      setActiveBands(result.active);
      setFetchedAt(result.fetchedAt);
      const rows = await listPriceHistory(getSupabase(), orgId, comicId);
      setHistory(rows);
    } catch (err) {
      setError(
        err instanceof PricingError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not refresh pricing.",
      );
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [comicId, orgId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await listPriceHistory(getSupabase(), orgId, comicId);
        if (cancelled) return;

        applyHistory(rows);

        if (isPricingStale(rows)) {
          await runRefresh();
        } else if (!cancelled) {
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load pricing.",
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyHistory, comicId, orgId, runRefresh]);

  return (
    <section className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-foreground">Pricing</h2>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span>Last refreshed {formatTimeAgo(fetchedAt)}</span>
          <button
            type="button"
            disabled={refreshing}
            onClick={() => void runRefresh()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-border text-accent hover:bg-input disabled:opacity-50"
            aria-label="Refresh pricing"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading comps…</p>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {!loading ? (
        <>
          <PriceBandCard
            title="Sold comps"
            subtitle="Sold comps · last 90 days"
            bands={soldBands}
          />
          <PriceBandCard
            title="Active listings"
            subtitle="eBay Browse · ask prices now"
            bands={activeBands}
          />
          <PriceChart points={chartPoints} />
        </>
      ) : null}
    </section>
  );
}
