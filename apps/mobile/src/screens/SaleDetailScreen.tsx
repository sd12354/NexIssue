import {
  computeProfit,
  createShippingLabel,
  createSignedLabelUrl,
  deriveSaleStatus,
  getSale,
  SalesError,
  type SaleWithComic,
} from "@app/api";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppIcon } from "../components/AppIcon";
import { Screen } from "../components/Screen";
import { useCatalog } from "../contexts/CatalogContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

type SaleDetailScreenProps = {
  saleId: string;
  onBack: () => void;
};

function statusPillStyle(label: ReturnType<typeof deriveSaleStatus>) {
  switch (label) {
    case "Delivered":
      return styles.pillDelivered;
    case "Shipped":
      return styles.pillShipped;
    case "Label Ready":
      return styles.pillReady;
    default:
      return styles.pillPending;
  }
}

export function SaleDetailScreen({ saleId, onBack }: SaleDetailScreenProps) {
  const { orgId } = useCatalog();
  const [sale, setSale] = useState<SaleWithComic | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      setSale(await getSale(supabase, orgId, saleId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load sale.");
    } finally {
      setLoading(false);
    }
  }, [orgId, saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerateLabel = async () => {
    setBusy(true);
    setError(null);
    try {
      await createShippingLabel(supabase, saleId);
      await load();
    } catch (err) {
      setError(
        err instanceof SalesError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not generate label.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleViewLabel = async () => {
    if (!sale?.label_storage_path) return;
    setBusy(true);
    try {
      const url = await createSignedLabelUrl(supabase, sale.label_storage_path);
      if (url) await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open label.");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenTracking = () => {
    if (sale?.tracking_url) void Linking.openURL(sale.tracking_url);
  };

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      </Screen>
    );
  }

  if (!sale) {
    return (
      <Screen>
        <Text style={styles.error}>{error ?? "Sale not found."}</Text>
      </Screen>
    );
  }

  const statusLabel = deriveSaleStatus(sale);
  const profit = computeProfit(sale, sale.comic?.acquired_cost);
  const title = sale.comic?.title ?? "Comic";
  const issue = sale.comic?.issue;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <AppIcon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>Sale detail</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>
          {title}
          {issue ? ` #${issue}` : ""}
        </Text>
        <Text style={styles.soldPrice}>
          ${Number(sale.sold_price).toLocaleString("en-US")}
        </Text>
        {sale.buyer_username ? (
          <Text style={styles.meta}>Buyer: {sale.buyer_username}</Text>
        ) : null}

        <View style={[styles.pill, statusPillStyle(statusLabel)]}>
          <Text style={styles.pillText}>{statusLabel}</Text>
        </View>

        <Text style={styles.sectionTitle}>Shipping</Text>
        {sale.tracking_number ? (
          <Pressable onPress={handleOpenTracking}>
            <Text style={styles.link}>{sale.tracking_number}</Text>
          </Pressable>
        ) : (
          <Text style={styles.meta}>No tracking number yet</Text>
        )}
        {sale.tracking_status ? (
          <Text style={styles.meta}>Status: {sale.tracking_status}</Text>
        ) : null}
        {sale.estimated_delivery ? (
          <Text style={styles.meta}>
            ETA: {new Date(sale.estimated_delivery).toLocaleDateString()}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {sale.label_storage_path ? (
            <Pressable
              disabled={busy}
              onPress={() => void handleViewLabel()}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>View label</Text>
            </Pressable>
          ) : null}
          {statusLabel === "Label Pending" || !sale.tracking_number ? (
            <Pressable
              disabled={busy}
              onPress={() => void handleGenerateLabel()}
              style={styles.secondaryButton}
            >
              {busy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={styles.secondaryButtonText}>
                  Generate label manually
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Profit</Text>
        <View style={styles.profitGrid}>
          <Text style={styles.meta}>Sold</Text>
          <Text style={styles.profitValue}>
            ${profit.soldPrice.toFixed(0)}
          </Text>
          <Text style={styles.meta}>Cost basis</Text>
          <Text style={styles.profitValue}>
            {profit.costBasis != null ? `$${profit.costBasis.toFixed(0)}` : "—"}
          </Text>
          <Text style={styles.meta}>eBay fees (13%)</Text>
          <Text style={styles.profitValue}>
            −${profit.ebayFees.toFixed(0)}
          </Text>
          <Text style={styles.meta}>Shippo</Text>
          <Text style={styles.profitValue}>
            {profit.shippoCost != null
              ? `−$${profit.shippoCost.toFixed(2)}`
              : "—"}
          </Text>
          <Text style={styles.metaStrong}>Net profit</Text>
          <Text
            style={[
              styles.profitValueStrong,
              profit.profit != null && profit.profit >= 0
                ? styles.profitPositive
                : styles.profitNegative,
            ]}
          >
            {profit.profit != null ? `$${profit.profit.toFixed(0)}` : "—"}
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingTop: 4,
  },
  heading: { color: colors.text, fontSize: 22, fontWeight: "800" },
  scroll: { paddingBottom: 32, paddingTop: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: "700" },
  soldPrice: {
    color: colors.text,
    fontFamily: "Menlo",
    fontSize: 28,
    fontWeight: "700",
    marginTop: 4,
  },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  metaStrong: { color: colors.text, fontSize: 13, fontWeight: "700" },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillPending: { backgroundColor: "rgba(255, 193, 7, 0.2)" },
  pillReady: { backgroundColor: "rgba(124, 92, 255, 0.2)" },
  pillShipped: { backgroundColor: "rgba(56, 189, 248, 0.2)" },
  pillDelivered: { backgroundColor: "rgba(94, 232, 183, 0.2)" },
  pillText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 20,
  },
  link: { color: colors.accent, fontSize: 14, textDecorationLine: "underline" },
  actions: { gap: 10, marginTop: 12 },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
  },
  primaryButtonText: { color: colors.text, fontWeight: "700" },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: { color: colors.accent, fontWeight: "600" },
  profitGrid: {
    columnGap: 12,
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 8,
  },
  profitValue: {
    color: colors.text,
    fontFamily: "Menlo",
    fontSize: 13,
    width: "45%",
  },
  profitValueStrong: {
    fontFamily: "Menlo",
    fontSize: 16,
    fontWeight: "700",
    width: "45%",
  },
  profitPositive: { color: "#5EE8B7" },
  profitNegative: { color: colors.danger },
  error: { color: colors.danger, fontSize: 13, marginTop: 12 },
});
