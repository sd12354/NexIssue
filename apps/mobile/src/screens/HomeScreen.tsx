import {
  computeProfit,
  deriveSaleStatus,
  getShippingFrom,
  listSales,
  type SaleWithComic,
} from "@app/api";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppIcon } from "../components/AppIcon";
import { Screen } from "../components/Screen";
import { useAuth } from "../contexts/AuthContext";
import { useCatalog } from "../contexts/CatalogContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

type HomeScreenProps = {
  onOpenSale: (saleId: string) => void;
  onOpenShippingSettings: () => void;
};

function formatSoldDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function HomeScreen({
  onOpenSale,
  onOpenShippingSettings,
}: HomeScreenProps) {
  const { user } = useAuth();
  const { orgId } = useCatalog();
  const [sales, setSales] = useState<SaleWithComic[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingFromAddress, setMissingFromAddress] = useState(false);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [rows, fromAddress] = await Promise.all([
        listSales(supabase, orgId),
        getShippingFrom(supabase, orgId),
      ]);
      setSales(rows);
      setMissingFromAddress(!fromAddress);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.eyebrow}>NexIssue</Text>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.email}>{user?.email ?? "Signed in"}</Text>

        {missingFromAddress && sales.length > 0 ? (
          <Pressable
            onPress={onOpenShippingSettings}
            style={({ pressed }) => [styles.warningBanner, pressed && styles.pressed]}
          >
            <AppIcon name="warning-outline" size={18} color="#FFC107" />
            <Text style={styles.warningText}>
              Add a ship-from address in Settings → Shipping before generating labels.
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionTitle}>Recent sales</Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} />
        ) : sales.length === 0 ? (
          <Text style={styles.empty}>
            No sales yet. Sold items will appear here after eBay checkout.
          </Text>
        ) : (
          sales.map((sale) => {
            const status = deriveSaleStatus(sale);
            const profit = computeProfit(sale, sale.comic?.acquired_cost);
            const title = sale.comic?.title ?? "Comic";
            const issue = sale.comic?.issue;

            return (
              <Pressable
                key={sale.id}
                onPress={() => onOpenSale(sale.id)}
                style={({ pressed }) => [styles.saleRow, pressed && styles.pressed]}
              >
                <View style={styles.saleBody}>
                  <Text style={styles.saleTitle}>
                    {title}
                    {issue ? ` #${issue}` : ""}
                  </Text>
                  <Text style={styles.saleMeta}>
                    {formatSoldDate(sale.sold_at)} ·{" "}
                    <Text
                      style={[
                        styles.profit,
                        profit.profit != null && profit.profit >= 0
                          ? styles.profitUp
                          : styles.profitDown,
                      ]}
                    >
                      {profit.profit != null
                        ? `$${profit.profit.toFixed(0)} profit`
                        : "—"}
                    </Text>
                  </Text>
                </View>
                <View style={styles.saleRight}>
                  <Text style={styles.salePrice}>
                    ${Number(sale.sold_price).toLocaleString("en-US")}
                  </Text>
                  <View style={styles.pill}>
                    <Text style={styles.pillText}>{status}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 4 },
  email: { color: colors.textMuted, fontSize: 14, marginBottom: 20 },
  warningBanner: {
    alignItems: "center",
    backgroundColor: "rgba(255, 193, 7, 0.12)",
    borderColor: "rgba(255, 193, 7, 0.35)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    padding: 12,
  },
  warningText: { color: colors.text, flex: 1, fontSize: 13, lineHeight: 18 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  empty: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 12 },
  saleRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    padding: 14,
  },
  saleBody: { flex: 1, gap: 4 },
  saleTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  saleMeta: { color: colors.textMuted, fontSize: 12 },
  profit: { fontFamily: "Menlo", fontWeight: "600" },
  profitUp: { color: "#5EE8B7" },
  profitDown: { color: colors.danger },
  saleRight: { alignItems: "flex-end", gap: 6 },
  salePrice: {
    color: colors.text,
    fontFamily: "Menlo",
    fontSize: 16,
    fontWeight: "700",
  },
  pill: {
    backgroundColor: "rgba(124, 92, 255, 0.18)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: { color: colors.accent, fontSize: 10, fontWeight: "700" },
  pressed: { opacity: 0.75 },
});
