"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  computeProfit,
  deriveSaleStatus,
  listSales,
  type SaleWithComic,
} from "@app/api";

import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { useCatalog } from "@/contexts/CatalogProvider";
import { getSupabase } from "@/lib/supabase";

export default function SalesPage() {
  const { orgId } = useCatalog();
  const [sales, setSales] = useState<SaleWithComic[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      setSales(await listSales(getSupabase(), orgId));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <PageHeader
        title="Sales & Shipping"
        subtitle="Track sold items, shipping labels, and profitability."
      />

      {loading ? (
        <p className="text-sm text-muted">Loading sales…</p>
      ) : sales.length === 0 ? (
        <Card className="p-6 text-sm text-muted">
          No sales yet. Sold items will appear here after eBay checkout.
        </Card>
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => {
            const status = deriveSaleStatus(sale);
            const profit = computeProfit(sale, sale.comic?.acquired_cost);
            const title = sale.comic?.title ?? "Comic";
            const issue = sale.comic?.issue;

            return (
              <Link key={sale.id} href={`/sales/${sale.id}`}>
                <Card className="flex flex-wrap items-center justify-between gap-4 p-4 transition hover:border-accent/40">
                  <div>
                    <p className="font-semibold text-foreground">
                      {title}
                      {issue ? ` #${issue}` : ""}
                    </p>
                    <p className="text-sm text-muted">
                      {new Date(sale.sold_at).toLocaleDateString()} · {status}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold text-foreground">
                      ${Number(sale.sold_price).toLocaleString("en-US")}
                    </p>
                    <p
                      className={`font-mono text-sm ${
                        profit.profit != null && profit.profit >= 0
                          ? "text-emerald-300"
                          : "text-danger"
                      }`}
                    >
                      {profit.profit != null
                        ? `$${profit.profit.toFixed(0)} profit`
                        : "—"}
                    </p>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
