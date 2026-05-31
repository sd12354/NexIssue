export type SaleComp = {
  price: number;
  saleDate: Date;
  gradeMatched: boolean;
};

export type WindowStats = {
  low: number | null;
  median: number | null;
  high: number | null;
  count: number;
};

export type PriceBands = {
  low30: number | null;
  median30: number | null;
  high30: number | null;
  count30: number;
  low60: number | null;
  median60: number | null;
  high60: number | null;
  count60: number;
  low90: number | null;
  median90: number | null;
  high90: number | null;
  count90: number;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function windowStats(sales: SaleComp[], days: number, now: Date): WindowStats {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);

  const prices = sales
    .filter((sale) => sale.saleDate >= cutoff)
    .map((sale) => sale.price);

  if (prices.length === 0) {
    return { low: null, median: null, high: null, count: 0 };
  }

  return {
    low: Math.min(...prices),
    high: Math.max(...prices),
    median: median(prices),
    count: prices.length,
  };
}

export function computePriceBands(
  sales: SaleComp[],
  now = new Date(),
): PriceBands {
  const w30 = windowStats(sales, 30, now);
  const w60 = windowStats(sales, 60, now);
  const w90 = windowStats(sales, 90, now);

  const sortedByDate = [...sales].sort(
    (a, b) => b.saleDate.getTime() - a.saleDate.getTime(),
  );
  const latest = sortedByDate[0];

  return {
    low30: w30.low,
    median30: w30.median,
    high30: w30.high,
    count30: w30.count,
    low60: w60.low,
    median60: w60.median,
    high60: w60.high,
    count60: w60.count,
    low90: w90.low,
    median90: w90.median,
    high90: w90.high,
    count90: w90.count,
    lastSalePrice: latest?.price ?? null,
    lastSaleDate: latest
      ? latest.saleDate.toISOString().slice(0, 10)
      : null,
  };
}

export function emptyPriceBands(): PriceBands {
  return {
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
  };
}

/** Active listing snapshot — same stats across 30/60/90 windows. */
export function computeSnapshotBands(prices: number[]): PriceBands {
  if (prices.length === 0) return emptyPriceBands();

  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const med = median(prices)!;
  const count = prices.length;

  return {
    low30: low,
    median30: med,
    high30: high,
    count30: count,
    low60: low,
    median60: med,
    high60: high,
    count60: count,
    low90: low,
    median90: med,
    high90: high,
    count90: count,
    lastSalePrice: null,
    lastSaleDate: null,
  };
}
