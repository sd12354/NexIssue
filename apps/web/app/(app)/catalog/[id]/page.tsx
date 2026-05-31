"use client";

import { createSignedPhotoUrl, deleteComic, deleteComicPhotos } from "@app/api";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Tag, Trash2 } from "lucide-react";

import {
  Badge,
  formatStatusLabel,
  gradeBadgeVariant,
  statusBadgeVariant,
} from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ComicPricingSection } from "@/components/pricing/ComicPricingSection";
import { Card } from "@/components/ui/Card";
import { useCatalog } from "@/contexts/CatalogProvider";
import { getSupabase } from "@/lib/supabase";

const SIGNED_URL_TTL = 60 * 60;

export default function ComicDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { getEntry, refresh } = useCatalog();
  const entry = getEntry(params.id);
  const [urls, setUrls] = useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  });
  const [deleting, setDeleting] = useState(false);

  const photos = entry?.photos ?? [];
  const frontPhoto = useMemo(
    () => photos.find((p) => p.position === "front") ?? null,
    [photos],
  );
  const backPhoto = useMemo(
    () => photos.find((p) => p.position === "back") ?? null,
    [photos],
  );

  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    (async () => {
      const supabase = getSupabase();
      const [front, back] = await Promise.all([
        frontPhoto
          ? createSignedPhotoUrl(supabase, frontPhoto.storage_path, SIGNED_URL_TTL).catch(
              () => null,
            )
          : Promise.resolve(null),
        backPhoto
          ? createSignedPhotoUrl(supabase, backPhoto.storage_path, SIGNED_URL_TTL).catch(
              () => null,
            )
          : Promise.resolve(null),
      ]);
      if (!cancelled) setUrls({ front, back });
    })();
    return () => {
      cancelled = true;
    };
  }, [entry, frontPhoto, backPhoto]);

  if (!entry) {
    return (
      <p className="text-muted">
        Comic not found.{" "}
        <Link href="/catalog" className="text-accent">
          Back to catalog
        </Link>
      </p>
    );
  }

  const { comic } = entry;
  const titleLine =
    [comic.title, comic.issue ? `#${comic.issue}` : null]
      .filter(Boolean)
      .join(" ") || "Untitled comic";
  const grade =
    comic.grade != null ? Number(comic.grade).toFixed(1) : "—";

  const handleDelete = async () => {
    if (!confirm(`Delete ${titleLine}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const supabase = getSupabase();
      try {
        await deleteComicPhotos(supabase, comic.org_id, comic.id);
      } catch {
        // best effort
      }
      await deleteComic(supabase, comic.org_id, comic.id);
      await refresh();
      router.push("/catalog");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Catalog
        </Link>
        <div className="flex gap-2">
          <Link href={`/catalog/${comic.id}/edit`}>
            <Button variant="secondary" className="gap-1 px-3">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          </Link>
          <Button
            variant="danger"
            className="gap-1 px-3"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-foreground">{titleLine}</h1>

      <Card className="mt-4 flex flex-wrap items-center gap-3 p-4">
        <Badge variant={gradeBadgeVariant(comic.grader)}>{comic.grader}</Badge>
        <span className="font-mono text-sm font-semibold text-foreground">
          {comic.cert_number}
        </span>
        <Badge variant="accent">{grade}</Badge>
        <Badge variant={statusBadgeVariant(comic.status)}>
          {formatStatusLabel(comic.status)}
        </Badge>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {(["Front", "Back"] as const).map((label, i) => {
          const uri = i === 0 ? urls.front : urls.back;
          return (
            <Card key={label} className="p-3">
              <div className="flex aspect-[2/3] items-center justify-center overflow-hidden rounded-lg bg-white">
                {uri ? (
                  <Image
                    src={uri}
                    alt={label}
                    width={300}
                    height={450}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-sm text-neutral-400">No photo</span>
                )}
              </div>
              <p className="mt-2 text-center text-xs font-semibold text-muted">
                {label}
              </p>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4 divide-y divide-surface-border">
        {[
          ["Year", comic.year ? String(comic.year) : "—"],
          ["Variant", comic.variant || "—"],
          ["Encapsulated", comic.encapsulation_date || "—"],
          [
            "Acquired cost",
            comic.acquired_cost != null
              ? `$${Number(comic.acquired_cost).toFixed(2)}`
              : "—",
          ],
          ["Acquired from", comic.acquired_source || "—"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-4 px-4 py-3 text-sm"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {label}
            </span>
            <span className="text-right text-foreground">{value}</span>
          </div>
        ))}
      </Card>

      {(comic.key_notes ?? []).length > 0 ? (
        <Card className="mt-4 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Key notes
          </p>
          <ul className="space-y-1 text-sm text-foreground">
            {(comic.key_notes ?? []).map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ComicPricingSection comicId={comic.id} orgId={comic.org_id} />

      {comic.status === "in_inventory" ? (
        <Link href={`/catalog/${comic.id}/sell`} className="mt-6 block">
          <Button className="w-full gap-2 py-3.5">
            <Tag className="h-5 w-5" />
            Sell Now
          </Button>
        </Link>
      ) : null}
    </>
  );
}
