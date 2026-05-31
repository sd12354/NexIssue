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
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppIcon } from "../AppIcon";
import { supabase } from "../../lib/supabase";
import { formatTimeAgo } from "../../lib/formatPrice";
import { colors } from "../../theme/colors";
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
      const result = await refreshPricing(supabase, comicId);
      setSoldBands(result.sold);
      setActiveBands(result.active);
      setFetchedAt(result.fetchedAt);
      const rows = await listPriceHistory(supabase, orgId, comicId);
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
        const rows = await listPriceHistory(supabase, orgId, comicId);
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
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Pricing</Text>
        <View style={styles.refreshRow}>
          <Text style={styles.refreshedAt}>
            Last refreshed {formatTimeAgo(fetchedAt)}
          </Text>
          <Pressable
            onPress={() => void runRefresh()}
            disabled={refreshing}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.refreshButtonPressed,
            ]}
            accessibilityLabel="Refresh pricing"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <AppIcon name="refresh-outline" size={18} color={colors.accent} />
            )}
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading comps…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

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
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  refreshRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  refreshedAt: { color: colors.textMuted, fontSize: 12 },
  refreshButton: {
    alignItems: "center",
    borderColor: colors.surfaceBorder,
    borderRadius: 8,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  refreshButtonPressed: { opacity: 0.7 },
  loadingWrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  loadingText: { color: colors.textMuted, fontSize: 13 },
  errorText: { color: colors.danger, fontSize: 13 },
});
