"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  computeProfit,
  createShippingLabel,
  createSignedLabelUrl,
  deriveSaleStatus,
  getSale,
  SalesError,
  type SaleWithComic,
} from "@app/api";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCatalog } from "@/contexts/CatalogProvider";
import { getSupabase } from "@/lib/supabase";

export default function SaleDetailPage() {
  const params = useParams<{ id: string }>();
  const saleId = params?.id;
  const { orgId } = useCatalog();
  const [sale, setSale] = useState<SaleWithComic | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !saleId) return;
    setLoading(true);
    try {
      setSale(await getSale(getSupabase(), orgId, saleId));
    } finally {
      setLoading(false);
    }
  }, [orgId, saleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerateLabel = async () => {
    if (!saleId) return;
    setBusy(true);
    setError(null);
    try {
      await createShippingLabel(getSupabase(), saleId);
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
      const url = await createSignedLabelUrl(getSupabase(), sale.label_storage_path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open label.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted">Loading sale…</p>;
  }

  if (!sale) {
    return <p className="text-sm text-danger">Sale not found.</p>;
  }

  const status = deriveSaleStatus(sale);
  const profit = computeProfit(sale, sale.comic?.acquired_cost);
  const title = sale.comic?.title ?? "Comic";
  const issue = sale.comic?.issue;

  return (
    <>
      <PageHeader
        title={`${title}${issue ? ` #${issue}` : ""}`}
        subtitle={`Sold ${new Date(sale.sold_at).toLocaleDateString()} · ${status}`}
        actions={
          <Link href="/sales">
            <Button variant="secondary">Back to sales</Button>
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h3 className="font-semibold text-foreground">Shipping</h3>
          {sale.buyer_username ? (
            <p className="text-sm text-muted">Buyer: {sale.buyer_username}</p>
          ) : null}
          {sale.tracking_number ? (
            sale.tracking_url ? (
              <a
                className="text-sm text-accent underline"
                href={sale.tracking_url}
                target="_blank"
                rel="noreferrer"
              >
                {sale.tracking_number}
              </a>
            ) : (
              <p className="font-mono text-sm">{sale.tracking_number}</p>
            )
          ) : (
            <p className="text-sm text-muted">No tracking number yet</p>
          )}
          {sale.tracking_status ? (
            <p className="text-sm text-muted">Status: {sale.tracking_status}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {sale.label_storage_path ? (
              <Button disabled={busy} onClick={() => void handleViewLabel()}>
                View label
              </Button>
            ) : null}
            {status === "Label Pending" || !sale.tracking_number ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void handleGenerateLabel()}
              >
                Generate label manually
              </Button>
            ) : null}
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </Card>

        <Card className="space-y-2 p-4">
          <h3 className="font-semibold text-foreground">Profit</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted">Sold</span>
            <span className="font-mono">${profit.soldPrice.toFixed(0)}</span>
            <span className="text-muted">Cost basis</span>
            <span className="font-mono">
              {profit.costBasis != null ? `$${profit.costBasis.toFixed(0)}` : "—"}
            </span>
            <span className="text-muted">eBay fees (13%)</span>
            <span className="font-mono">−${profit.ebayFees.toFixed(0)}</span>
            <span className="text-muted">Shippo</span>
            <span className="font-mono">
              {profit.shippoCost != null
                ? `−$${profit.shippoCost.toFixed(2)}`
                : "—"}
            </span>
            <span className="font-medium text-foreground">Net profit</span>
            <span
              className={`font-mono font-semibold ${
                profit.profit != null && profit.profit >= 0
                  ? "text-emerald-300"
                  : "text-danger"
              }`}
            >
              {profit.profit != null ? `$${profit.profit.toFixed(0)}` : "—"}
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}
