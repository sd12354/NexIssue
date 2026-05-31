"use client";

import type { ChartPoint } from "@app/api";
import { useMemo, useState } from "react";

type PriceChartProps = {
  points: ChartPoint[];
};

const WINDOW_OPTIONS = [30, 60, 90, 180] as const;
const CHART_HEIGHT = 160;
const CHART_WIDTH = 640;
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
        (filtered.length === 1
          ? plotWidth / 2
          : (index / (filtered.length - 1)) * plotWidth);
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
    <div className="rounded-card border border-surface-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground">Sold price trend</h3>
        <div className="flex gap-1.5">
          {WINDOW_OPTIONS.map((days) => {
            const active = windowDays === days;
            return (
              <button
                key={days}
                type="button"
                onClick={() => setWindowDays(days)}
                className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold ${
                  active
                    ? "border-accent bg-accent text-foreground"
                    : "border-surface-border text-muted"
                }`}
              >
                {days}d
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-[160px] w-full overflow-hidden">
        {geometry ? (
          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-[160px] w-full"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={geometry.areaPath} fill="url(#priceFill)" />
            <path
              d={geometry.linePath}
              fill="none"
              stroke="#7c5cff"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <div className="flex h-[160px] items-center justify-center px-4 text-center text-sm text-muted">
            Not enough sold comps to chart this window.
          </div>
        )}
      </div>

      <p className="mt-2 text-center font-mono text-[11px] text-muted">
        {geometry?.sampleCount ?? 0} sold comps in chart window
      </p>
    </div>
  );
}
