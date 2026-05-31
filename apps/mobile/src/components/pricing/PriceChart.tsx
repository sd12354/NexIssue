import type { ChartPoint } from "@app/api";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import { colors } from "../../theme/colors";

type PriceChartProps = {
  points: ChartPoint[];
};

const WINDOW_OPTIONS = [30, 60, 90, 180] as const;
const CHART_HEIGHT = 160;
const CHART_WIDTH = 320;
const PADDING = { top: 12, right: 12, bottom: 24, left: 12 };

export function PriceChart({ points }: PriceChartProps) {
  const [windowDays, setWindowDays] =
    useState<(typeof WINDOW_OPTIONS)[number]>(90);

  const filtered = useMemo(() => {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    return points.filter((point) => Date.parse(point.date) >= cutoff);
  }, [points, windowDays]);

  const geometry = useMemo(() => {
    if (filtered.length < 2) return null;

    const prices = filtered.map((point) => point.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
    const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;

    const coords = filtered.map((point, index) => {
      const x = PADDING.left +
        (filtered.length === 1 ? plotWidth / 2 : (index / (filtered.length - 1)) * plotWidth);
      const y = PADDING.top +
        (1 - (point.price - minPrice) / priceRange) * plotHeight;
      return { x, y };
    });

    const linePath = coords
      .map((coord, index) =>
        `${index === 0 ? "M" : "L"} ${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`
      )
      .join(" ");

    const baseline = PADDING.top + plotHeight;
    const areaPath =
      `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${baseline} L ${coords[0].x.toFixed(1)} ${baseline} Z`;

    return { linePath, areaPath, sampleCount: filtered.length };
  }, [filtered]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Sold price trend</Text>
        <View style={styles.toggleRow}>
          {WINDOW_OPTIONS.map((days) => {
            const active = windowDays === days;
            return (
              <Pressable
                key={days}
                onPress={() => setWindowDays(days)}
                style={[styles.toggle, active && styles.toggleActive]}
              >
                <Text
                  style={[styles.toggleLabel, active && styles.toggleLabelActive]}
                >
                  {days}d
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.chartWrap}>
        {geometry ? (
          <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
            <Defs>
              <LinearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={colors.accent} stopOpacity="0.35" />
                <Stop offset="100%" stopColor={colors.accent} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Path d={geometry.areaPath} fill="url(#priceFill)" />
            <Path
              d={geometry.linePath}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : (
          <View style={styles.emptyChart}>
            <Text style={styles.emptyText}>
              Not enough sold comps to chart this window.
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.sampleCount}>
        {geometry?.sampleCount ?? 0} sold comps in chart window
      </Text>
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
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: { color: colors.text, fontSize: 15, fontWeight: "700" },
  toggleRow: { flexDirection: "row", gap: 6 },
  toggle: {
    borderColor: colors.surfaceBorder,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toggleActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  toggleLabel: {
    color: colors.textMuted,
    fontFamily: "Menlo",
    fontSize: 11,
    fontWeight: "700",
  },
  toggleLabelActive: { color: colors.text },
  chartWrap: {
    minHeight: CHART_HEIGHT,
    overflow: "hidden",
    width: "100%",
  },
  emptyChart: {
    alignItems: "center",
    height: CHART_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
  },
  sampleCount: {
    color: colors.textMuted,
    fontFamily: "Menlo",
    fontSize: 11,
    textAlign: "center",
  },
});
