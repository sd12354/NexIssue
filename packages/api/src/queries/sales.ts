import { FunctionsHttpError } from "@supabase/supabase-js";
import type { Tables } from "types";

import type { NexIssueSupabaseClient } from "../client";

export type SaleRow = Tables<"sales">;

export type SaleWithComic = SaleRow & {
  comic: {
    id: string;
    title: string | null;
    issue: string | null;
    grade: number | null;
    grader: string;
    acquired_cost: number | null;
  } | null;
};

export type SaleStatusLabel =
  | "Label Pending"
  | "Label Ready"
  | "Shipped"
  | "Delivered";

export type CreateLabelResult = {
  saleId: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelStoragePath: string | null;
  shippoLabelId: string;
  shippoLabelCost: number | null;
  status: string;
  pdfStored: boolean;
};

export type ProfitBreakdown = {
  soldPrice: number;
  costBasis: number | null;
  ebayFees: number;
  shippoCost: number | null;
  profit: number | null;
};

export class SalesError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "SalesError";
  }
}

const EBAY_FEE_RATE = 0.13;
export const SHIPPING_LABELS_BUCKET = "shipping-labels";

function parseSaleWithComic(row: Record<string, unknown>): SaleWithComic {
  const listings = row.listings as Record<string, unknown> | null;
  const comics = listings?.comics as Record<string, unknown> | null;

  const { listings: _listings, ...sale } = row;

  return {
    ...(sale as SaleRow),
    comic: comics
      ? {
        id: String(comics.id ?? ""),
        title: typeof comics.title === "string" ? comics.title : null,
        issue: typeof comics.issue === "string" ? comics.issue : null,
        grade: typeof comics.grade === "number" ? comics.grade : null,
        grader: typeof comics.grader === "string" ? comics.grader : "CGC",
        acquired_cost: typeof comics.acquired_cost === "number"
          ? comics.acquired_cost
          : null,
      }
      : null,
  };
}

export function deriveSaleStatus(sale: Pick<
  SaleRow,
  "status" | "tracking_number" | "delivered_at" | "shipped_at"
>): SaleStatusLabel {
  if (sale.status === "delivered" || sale.delivered_at) return "Delivered";
  if (sale.status === "shipped" || sale.shipped_at) return "Shipped";
  if (sale.status === "label_created" || sale.tracking_number) return "Label Ready";
  return "Label Pending";
}

export function computeProfit(
  sale: Pick<SaleRow, "sold_price" | "shippo_label_cost">,
  acquiredCost: number | null | undefined,
): ProfitBreakdown {
  const soldPrice = Number(sale.sold_price);
  const costBasis = acquiredCost ?? null;
  const ebayFees = soldPrice * EBAY_FEE_RATE;
  const shippoCost = sale.shippo_label_cost != null
    ? Number(sale.shippo_label_cost)
    : null;

  const profit = costBasis != null
    ? soldPrice - costBasis - ebayFees - (shippoCost ?? 0)
    : null;

  return { soldPrice, costBasis, ebayFees, shippoCost, profit };
}

async function parseFunctionError(error: FunctionsHttpError): Promise<SalesError> {
  try {
    const body = (await error.context.json()) as { error?: string; message?: string };
    if (body.message) {
      return new SalesError(body.error ?? "sales_action_failed", body.message);
    }
  } catch {
    // ignore
  }
  return new SalesError(
    "sales_action_failed",
    error.message || "Sales request failed.",
  );
}

export async function listSales(
  client: NexIssueSupabaseClient,
  orgId: string,
): Promise<SaleWithComic[]> {
  const { data, error } = await client
    .from("sales")
    .select(`
      *,
      listings (
        comics (
          id,
          title,
          issue,
          grade,
          grader,
          acquired_cost
        )
      )
    `)
    .eq("org_id", orgId)
    .order("sold_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) =>
    parseSaleWithComic(row as Record<string, unknown>)
  );
}

export async function getSale(
  client: NexIssueSupabaseClient,
  orgId: string,
  saleId: string,
): Promise<SaleWithComic | null> {
  const { data, error } = await client
    .from("sales")
    .select(`
      *,
      listings (
        comics (
          id,
          title,
          issue,
          grade,
          grader,
          acquired_cost
        )
      )
    `)
    .eq("org_id", orgId)
    .eq("id", saleId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return parseSaleWithComic(data as Record<string, unknown>);
}

export async function createShippingLabel(
  client: NexIssueSupabaseClient,
  saleId: string,
): Promise<CreateLabelResult> {
  const { data, error } = await client.functions.invoke("shippo-create-label", {
    body: { saleId },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw await parseFunctionError(error);
    }
    throw new SalesError(
      "network_error",
      error.message || "Could not reach label service.",
    );
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload || typeof payload.saleId !== "string") {
    throw new SalesError(
      "sales_action_failed",
      "Unexpected response from shippo-create-label.",
    );
  }

  return {
    saleId: payload.saleId,
    trackingNumber: typeof payload.trackingNumber === "string"
      ? payload.trackingNumber
      : null,
    trackingUrl: typeof payload.trackingUrl === "string"
      ? payload.trackingUrl
      : null,
    labelStoragePath: typeof payload.labelStoragePath === "string"
      ? payload.labelStoragePath
      : null,
    shippoLabelId: typeof payload.shippoLabelId === "string"
      ? payload.shippoLabelId
      : "",
    shippoLabelCost: typeof payload.shippoLabelCost === "number"
      ? payload.shippoLabelCost
      : null,
    status: typeof payload.status === "string" ? payload.status : "label_created",
    pdfStored: payload.pdfStored === true,
  };
}

export async function createSignedLabelUrl(
  client: NexIssueSupabaseClient,
  labelStoragePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  const { data, error } = await client.storage
    .from(SHIPPING_LABELS_BUCKET)
    .createSignedUrl(labelStoragePath, expiresInSeconds);

  if (error) throw error;
  return data?.signedUrl ?? null;
}
