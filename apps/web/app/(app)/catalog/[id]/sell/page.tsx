"use client";

import {
  createSignedPhotoUrl,
  generateListingDraft,
  getIntegration,
  publishListing,
} from "@app/api";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCatalog } from "@/contexts/CatalogProvider";
import { getSupabase } from "@/lib/supabase";

const SIGNED_URL_TTL = 60 * 60;

export default function SellComicPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { getEntry, refresh } = useCatalog();
  const entry = getEntry(params.id);
  const comic = entry?.comic;
  const photos = entry?.photos ?? [];
  const draft = useMemo(
    () => (comic ? generateListingDraft(comic) : null),
    [comic],
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [ebayConnected, setEbayConnected] = useState<boolean | null>(null);
  const [ebayAccount, setEbayAccount] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    setTitle(draft.title);
    setDescription(draft.description);
    setPrice(
      draft.suggestedPrice != null ? draft.suggestedPrice.toFixed(2) : "",
    );
  }, [draft]);

  useEffect(() => {
    if (!comic) return;
    let cancelled = false;
    (async () => {
      const integration = await getIntegration(getSupabase(), comic.org_id, "ebay");
      if (cancelled) return;
      setEbayConnected(!!integration);
      setEbayAccount(
        typeof integration?.metadata?.account === "string"
          ? integration.metadata.account
          : null,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [comic]);

  useEffect(() => {
    if (!photos.length) return;
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      const urls = await Promise.all(
        photos.slice(0, 4).map((p) =>
          createSignedPhotoUrl(supabase, p.storage_path, SIGNED_URL_TTL).catch(
            () => null,
          ),
        ),
      );
      if (!cancelled) setPhotoUrls(urls.filter(Boolean) as string[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [photos]);

  const parsedPrice = useMemo(() => {
    const value = Number.parseFloat(price.replace(/[^0-9.]/g, ""));
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [price]);

  const canPublish =
    ebayConnected === true &&
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    parsedPrice != null &&
    photos.length > 0 &&
    !publishing;

  const handlePublish = useCallback(async () => {
    if (!comic || !canPublish || parsedPrice == null) return;
    setPublishing(true);
    setError(null);
    try {
      await publishListing(getSupabase(), {
        comicId: comic.id,
        title: title.trim(),
        description: description.trim(),
        askingPrice: parsedPrice,
      });
      await refresh();
      router.push("/listings");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish listing");
    } finally {
      setPublishing(false);
    }
  }, [comic, canPublish, parsedPrice, title, description, refresh, router]);

  if (!entry || !comic || !draft) {
    return (
      <p className="text-muted">
        Comic not found.{" "}
        <Link href="/catalog" className="text-accent">
          Back to catalog
        </Link>
      </p>
    );
  }

  return (
    <>
      <Link
        href={`/catalog/${comic.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <PageHeader
        title="Review Listing"
        subtitle="Review and edit your listing before publishing to eBay."
      />

      {ebayConnected === false ? (
        <Card className="mb-4 border-accent/30 bg-accent/10 p-4">
          <p className="text-sm text-foreground">
            Connect eBay in{" "}
            <Link href="/settings?tab=integrations" className="font-semibold text-accent">
              Settings → Integrations
            </Link>{" "}
            before publishing.
          </p>
        </Card>
      ) : ebayConnected ? (
        <p className="mb-4 text-sm text-muted">
          eBay connected{ebayAccount ? ` · ${ebayAccount}` : ""}
        </p>
      ) : null}

      <div className="space-y-6 pb-24">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Photos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {photoUrls.map((url, i) => (
              <Card key={url} className="overflow-hidden p-2">
                <div className="aspect-[2/3] overflow-hidden rounded-lg bg-white">
                  <Image
                    src={url}
                    alt={`Photo ${i + 1}`}
                    width={120}
                    height={180}
                    className="h-full w-full object-contain"
                  />
                </div>
              </Card>
            ))}
            {photoUrls.length === 0 ? (
              <Card className="col-span-full p-6 text-center text-sm text-muted">
                No photos on file. Add photos from the mobile app before listing.
              </Card>
            ) : null}
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-semibold text-foreground">
              Listing title
            </label>
            <span className="text-xs text-muted">{title.length}/80</span>
          </div>
          <input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-card border border-surface-border bg-input px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </section>

        <section>
          <label className="mb-2 block text-sm font-semibold text-foreground">
            Asking price (USD)
          </label>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-card border border-surface-border bg-input px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {draft.suggestedPrice == null ? (
            <p className="mt-1 text-xs text-muted">
              Add an acquired cost on the comic for a suggested price.
            </p>
          ) : (
            <p className="mt-1 text-xs text-accent">AI suggested from cost basis</p>
          )}
        </section>

        <section>
          <label className="mb-2 block text-sm font-semibold text-foreground">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            className="w-full rounded-card border border-surface-border bg-input px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </section>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Item specifics
          </h2>
          <dl className="divide-y divide-surface-border">
            {Object.entries(draft.itemSpecifics).map(([key, value]) => (
              <div
                key={key}
                className="flex justify-between gap-4 py-2 text-sm first:pt-0 last:pb-0"
              >
                <dt className="text-muted">{key}</dt>
                <dd className="text-right text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10 border-t border-surface-border bg-surface/95 backdrop-blur sm:left-56">
        <div className="mx-auto flex max-w-4xl items-center justify-end gap-3 px-5 py-4">
          <Button variant="secondary" disabled title="Draft saving — Phase 3">
            Save as Draft
          </Button>
          <Button
            disabled={!canPublish}
            onClick={() => void handlePublish()}
            className="min-w-[160px]"
          >
            {publishing ? "Publishing…" : "Publish to eBay"}
          </Button>
        </div>
      </div>
    </>
  );
}
