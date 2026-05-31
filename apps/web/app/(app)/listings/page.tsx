"use client";

import { listListings, type ListingWithComic } from "@app/api";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { LoadingScreen } from "@/components/LoadingScreen";
import { PageHeader } from "@/components/PageHeader";
import { Badge, formatStatusLabel, statusBadgeVariant } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { useCatalog } from "@/contexts/CatalogProvider";
import { getSupabase } from "@/lib/supabase";

export default function ListingsPage() {
  const { orgId } = useCatalog();
  const [listings, setListings] = useState<ListingWithComic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      setListings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listListings(getSupabase(), orgId);
      setListings(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Listings"
        subtitle="Published eBay listings from your catalog. Rules engine auto-publish comes in Phase 3."
      />

      {error ? <p className="mb-4 text-sm text-danger">{error}</p> : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Comic</th>
                <th className="px-4 py-3 font-semibold">Price</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Published</th>
                <th className="px-4 py-3 font-semibold">eBay ID</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5}>
                    <LoadingScreen compact message="Loading listings…" />
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted">
                    No listings yet. Sell a comic from the{" "}
                    <Link href="/catalog" className="text-accent">
                      catalog
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                listings.map((listing) => {
                  const title =
                    listing.title ||
                    [
                      listing.comic?.title,
                      listing.comic?.issue ? `#${listing.comic.issue}` : null,
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                    "Untitled";
                  const listingUrl =
                    listing.marketplace_listing_id && listing.marketplace === "ebay"
                      ? `https://www.ebay.com/itm/${listing.marketplace_listing_id}`
                      : null;
                  return (
                    <tr
                      key={listing.id}
                      className="border-b border-surface-border/70 hover:bg-input/40"
                    >
                      <td className="px-4 py-3">
                        {listing.comic_id ? (
                          <Link
                            href={`/catalog/${listing.comic_id}`}
                            className="font-medium text-foreground hover:text-accent"
                          >
                            {title}
                          </Link>
                        ) : (
                          title
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {listing.asking_price != null
                          ? `$${Number(listing.asking_price).toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusBadgeVariant(listing.status)}>
                          {formatStatusLabel(listing.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {listing.published_at
                          ? new Date(listing.published_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {listingUrl ? (
                          <a
                            href={listingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                          >
                            {listing.marketplace_listing_id}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
