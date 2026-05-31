import type {
  PriceSourceDiagnostic,
  PriceSourceDiagnostics,
  SoldCompsBreakdown,
  SourcePriceBands,
} from "@app/api";
import { StyleSheet, Text, View } from "react-native";

import { formatPrice, formatPricingNote } from "../../lib/formatPrice";
import { colors } from "../../theme/colors";

type PriceBandCardProps = {
  title: string;
  subtitle: string;
  bands: SourcePriceBands;
};

const WINDOWS = [
  { key: "30", label: "30d", low: "low30", median: "median30", high: "high30", count: "count30" },
  { key: "60", label: "60d", low: "low60", median: "median60", high: "high60", count: "count60" },
  { key: "90", label: "90d", low: "low90", median: "median90", high: "high90", count: "count90" },
] as const;

type Tone = "ok" | "muted" | "warn";

function diagnosticLabel(
  source: "GoCollect" | "eBay Finding" | "eBay Browse",
  diag: PriceSourceDiagnostic | undefined,
  fallbackCount: number | null,
  unit: "sales" | "listings",
): { label: string; tone: Tone } {
  if (diag) {
    switch (diag.status) {
      case "ok":
        return { label: `${source}: ${diag.count} ${unit}`, tone: "ok" };
      case "no_data":
        return { label: `${source}: 0 ${unit}`, tone: "muted" };
      case "not_configured":
        return { label: `${source}: not configured`, tone: "warn" };
      case "error":
        return { label: `${source}: error`, tone: "warn" };
    }
  }
  if (fallbackCount != null && fallbackCount > 0) {
    return { label: `${source}: ${fallbackCount} ${unit}`, tone: "ok" };
  }
  return { label: `${source}: 0 ${unit}`, tone: "muted" };
}

function toneColor(tone: Tone): string {
  if (tone === "warn") return colors.danger;
  if (tone === "ok") return colors.text;
  return colors.textMuted;
}

function SoldDiagnostics({
  diagnostics,
  breakdown,
}: {
  diagnostics: PriceSourceDiagnostics | undefined;
  breakdown: SoldCompsBreakdown | undefined;
}) {
  const gc = diagnosticLabel(
    "GoCollect",
    diagnostics?.gocollect,
    breakdown?.gocollect ?? null,
    "sales",
  );
  const ebay = diagnosticLabel(
    "eBay Finding",
    diagnostics?.ebaySold,
    breakdown?.ebay ?? null,
    "sales",
  );
  return (
    <Text style={styles.breakdown}>
      <Text style={{ color: toneColor(gc.tone) }}>{gc.label}</Text>
      <Text style={styles.breakdownSep}> · </Text>
      <Text style={{ color: toneColor(ebay.tone) }}>{ebay.label}</Text>
    </Text>
  );
}

function ActiveDiagnostics({
  diagnostics,
  compsStored,
}: {
  diagnostics: PriceSourceDiagnostics | undefined;
  compsStored: number;
}) {
  const d = diagnosticLabel(
    "eBay Browse",
    diagnostics?.ebayActive,
    compsStored,
    "listings",
  );
  return (
    <Text style={[styles.breakdown, { color: toneColor(d.tone) }]}>
      {d.label}
    </Text>
  );
}

export function PriceBandCard({ title, subtitle, bands }: PriceBandCardProps) {
  const isSold = bands.source === "gocollect";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {isSold ? (
          <SoldDiagnostics
            diagnostics={bands.diagnostics}
            breakdown={bands.breakdown}
          />
        ) : (
          <ActiveDiagnostics
            diagnostics={bands.diagnostics}
            compsStored={bands.compsStored}
          />
        )}
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.cellLabel, styles.windowCol]} />
        <Text style={styles.cellLabel}>Low</Text>
        <Text style={styles.cellLabel}>Median</Text>
        <Text style={styles.cellLabel}>High</Text>
      </View>

      {WINDOWS.map((window) => {
        const low = bands[window.low];
        const median = bands[window.median];
        const high = bands[window.high];
        const count = bands[window.count];

        return (
          <View key={window.key}>
            <View style={styles.row}>
              <Text style={[styles.windowLabel, styles.windowCol]}>
                {window.label}
              </Text>
              <Text style={styles.price}>{formatPrice(low)}</Text>
              <Text style={[styles.price, styles.priceMedian]}>
                {formatPrice(median)}
              </Text>
              <Text style={styles.price}>{formatPrice(high)}</Text>
            </View>
            <Text style={styles.count}>{count} comps</Text>
          </View>
        );
      })}

      {(() => {
        const note = formatPricingNote(bands.message);
        return note ? <Text style={styles.note}>{note}</Text> : null;
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  header: { gap: 2, marginBottom: 4 },
  title: { color: colors.text, fontSize: 15, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 12 },
  breakdown: { fontSize: 11, marginTop: 2 },
  breakdownSep: { color: colors.textMuted },
  tableHeader: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 4,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 4,
  },
  windowCol: { width: 36 },
  cellLabel: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textAlign: "right",
    textTransform: "uppercase",
  },
  windowLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  price: {
    color: colors.text,
    flex: 1,
    fontFamily: "Menlo",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
  },
  priceMedian: { color: colors.accent },
  count: {
    color: colors.textMuted,
    fontFamily: "Menlo",
    fontSize: 11,
    marginBottom: 4,
    marginLeft: 44,
  },
  note: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});
