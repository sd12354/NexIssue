import { FunctionsHttpError } from "@supabase/supabase-js";
import type { Tables } from "types";

import type { NexIssueSupabaseClient } from "../client";
import {
  computePriceBands,
  computeSnapshotBands,
  emptyPriceBands,
  type PriceBands,
  type SaleComp,
} from "../pricing-stats";

export type PriceHistoryRow = Pick<
  Tables<"price_history">,
  | "id"
  | "comic_id"
  | "org_id"
  | "source"
  | "price"
  | "sale_date"
  | "grade_matched"
  | "fetched_at"
  | "metadata"
>;

export type SoldCompsBreakdown = {
  gocollect: number;
  ebay: number;
};

export type PriceSourceStatus =
  | "ok"
  | "no_data"
  | "not_configured"
  | "error";

export type PriceSourceDiagnostic = {
  status: PriceSourceStatus;
  count: number;
  message?: string;
};

export type PriceSourceDiagnostics = {
  gocollect?: PriceSourceDiagnostic;
  ebaySold?: PriceSourceDiagnostic;
  ebayActive?: PriceSourceDiagnostic;
};

export type PriceBandWindow = {
  low: number | null;
  median: number | null;
  high: number | null;
  count: number;
};

export type SourcePriceBands = PriceBands & {
  source: "gocollect" | "ebay";
  compsStored: number;
  gocollectItemId?: string | null;
  breakdown?: SoldCompsBreakdown;
  message?: string;
  diagnostics?: PriceSourceDiagnostics;
};

export type PricingRefreshResult = {
  comicId: string;
  fetchedAt: string;
  sold: SourcePriceBands;
  active: SourcePriceBands;
};

export type ChartPoint = {
  date: string;
  price: number;
};

export const PRICING_STALE_MS = 24 * 60 * 60 * 1000;

export class PricingError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "PricingError";
  }
}

export function latestFetchedAt(rows: PriceHistoryRow[]): string | null {
  if (rows.length === 0) return null;
  return rows.reduce(
    (latest, row) => (row.fetched_at > latest ? row.fetched_at : latest),
    rows[0].fetched_at,
  );
}

export function isPricingStale(
  rows: PriceHistoryRow[],
  maxAgeMs = PRICING_STALE_MS,
): boolean {
  const latest = latestFetchedAt(rows);
  if (!latest) return true;
  return Date.now() - Date.parse(latest) > maxAgeMs;
}

export function bandsFromHistory(
  rows: PriceHistoryRow[],
  source: "gocollect" | "ebay",
): SourcePriceBands {
  if (source === "gocollect") {
    const gocollectRows = rows.filter((row) => row.source === "gocollect");
    const ebaySoldRows = rows.filter((row) => row.source === "ebay_sold");
    const combined = [...gocollectRows, ...ebaySoldRows];

    const sales: SaleComp[] = combined
      .filter((row) => row.sale_date)
      .map((row) => ({
        price: Number(row.price),
        saleDate: new Date(row.sale_date!),
        gradeMatched: row.grade_matched ?? true,
      }));

    const bands = sales.length > 0 ? computePriceBands(sales) : emptyPriceBands();
    return {
      source,
      compsStored: combined.length,
      breakdown: {
        gocollect: gocollectRows.length,
        ebay: ebaySoldRows.length,
      },
      ...bands,
    };
  }

  const filtered = rows.filter((row) => row.source === source);

  const prices = filtered.map((row) => Number(row.price));
  const bands = prices.length > 0
    ? computeSnapshotBands(prices)
    : emptyPriceBands();

  return {
    source,
    compsStored: filtered.length,
    ...bands,
  };
}

export function chartPointsFromHistory(
  rows: PriceHistoryRow[],
  windowDays: number,
): ChartPoint[] {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  return rows
    .filter(
      (row) =>
        (row.source === "gocollect" || row.source === "ebay_sold") &&
        row.sale_date &&
        Date.parse(row.sale_date) >= cutoff,
    )
    .map((row) => ({
      date: row.sale_date!,
      price: Number(row.price),
    }))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

export async function listPriceHistory(
  client: NexIssueSupabaseClient,
  orgId: string,
  comicId: string,
): Promise<PriceHistoryRow[]> {
  const { data, error } = await client
    .from("price_history")
    .select(
      "id, org_id, comic_id, source, price, sale_date, grade_matched, fetched_at, metadata",
    )
    .eq("org_id", orgId)
    .eq("comic_id", comicId)
    .order("fetched_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PriceHistoryRow[];
}

async function parseFunctionError(error: FunctionsHttpError): Promise<PricingError> {
  const status = error.context?.status;

  try {
    const body = (await error.context.json()) as { error?: string; message?: string };
    if (body.message) {
      return new PricingError(body.error ?? "pricing_refresh_failed", body.message);
    }
  } catch {
    // Response body was not JSON.
  }

  if (status === 404) {
    return new PricingError(
      "not_deployed",
      "Pricing refresh is not available. Deploy with: supabase functions deploy pricing-refresh",
    );
  }

  return new PricingError(
    "pricing_refresh_failed",
    error.message || `Pricing refresh failed (HTTP ${status ?? "unknown"}).`,
  );
}

function parseDiagnostic(value: unknown): PriceSourceDiagnostic | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const status = obj.status;
  if (
    status !== "ok" &&
    status !== "no_data" &&
    status !== "not_configured" &&
    status !== "error"
  ) {
    return undefined;
  }
  return {
    status,
    count: typeof obj.count === "number" ? obj.count : 0,
    message: typeof obj.message === "string" ? obj.message : undefined,
  };
}

function parseDiagnostics(value: unknown): PriceSourceDiagnostics | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const out: PriceSourceDiagnostics = {};
  const g = parseDiagnostic(obj.gocollect);
  const s = parseDiagnostic(obj.ebaySold);
  const a = parseDiagnostic(obj.ebayActive);
  if (g) out.gocollect = g;
  if (s) out.ebaySold = s;
  if (a) out.ebayActive = a;
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseSourceBands(
  obj: Record<string, unknown>,
  source: "gocollect" | "ebay",
): SourcePriceBands {
  const num = (key: string) =>
    typeof obj[key] === "number" ? (obj[key] as number) : null;

  const breakdownRaw = obj.breakdown;
  const breakdown =
    breakdownRaw && typeof breakdownRaw === "object" && !Array.isArray(breakdownRaw)
      ? {
        gocollect: typeof (breakdownRaw as Record<string, unknown>).gocollect ===
            "number"
          ? (breakdownRaw as Record<string, unknown>).gocollect as number
          : 0,
        ebay: typeof (breakdownRaw as Record<string, unknown>).ebay === "number"
          ? (breakdownRaw as Record<string, unknown>).ebay as number
          : 0,
      }
      : undefined;

  return {
    source,
    compsStored: typeof obj.compsStored === "number" ? obj.compsStored : 0,
    gocollectItemId: typeof obj.gocollectItemId === "string"
      ? obj.gocollectItemId
      : null,
    breakdown,
    diagnostics: parseDiagnostics(obj.diagnostics),
    low30: num("low30"),
    median30: num("median30"),
    high30: num("high30"),
    count30: typeof obj.count30 === "number" ? obj.count30 : 0,
    low60: num("low60"),
    median60: num("median60"),
    high60: num("high60"),
    count60: typeof obj.count60 === "number" ? obj.count60 : 0,
    low90: num("low90"),
    median90: num("median90"),
    high90: num("high90"),
    count90: typeof obj.count90 === "number" ? obj.count90 : 0,
    lastSalePrice: num("lastSalePrice"),
    lastSaleDate: typeof obj.lastSaleDate === "string" ? obj.lastSaleDate : null,
    message: typeof obj.message === "string" ? obj.message : undefined,
  };
}

function parseRefreshPayload(payload: Record<string, unknown>): PricingRefreshResult {
  const soldObj = payload.sold && typeof payload.sold === "object" &&
      !Array.isArray(payload.sold)
    ? payload.sold as Record<string, unknown>
    : payload;
  const activeObj = payload.active && typeof payload.active === "object" &&
      !Array.isArray(payload.active)
    ? payload.active as Record<string, unknown>
    : {};

  return {
    comicId: typeof payload.comicId === "string" ? payload.comicId : "",
    fetchedAt: typeof payload.fetchedAt === "string"
      ? payload.fetchedAt
      : new Date().toISOString(),
    sold: parseSourceBands(soldObj, "gocollect"),
    active: parseSourceBands(activeObj, "ebay"),
  };
}

/**
 * Refresh GoCollect sold + eBay active comps via the `pricing-refresh` edge function.
 */
export async function refreshPricing(
  client: NexIssueSupabaseClient,
  comicId: string,
): Promise<PricingRefreshResult> {
  const { data, error } = await client.functions.invoke("pricing-refresh", {
    body: { comicId },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw await parseFunctionError(error);
    }
    throw new PricingError(
      "network_error",
      error.message || "Could not reach pricing refresh service.",
    );
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") {
    throw new PricingError(
      "pricing_refresh_failed",
      "Empty response from pricing-refresh.",
    );
  }

  if (typeof payload.comicId !== "string") {
    throw new PricingError(
      "pricing_refresh_failed",
      typeof payload.message === "string"
        ? payload.message
        : "Unexpected response from pricing-refresh.",
    );
  }

  return parseRefreshPayload(payload);
}
