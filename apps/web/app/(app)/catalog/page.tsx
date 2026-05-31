"use client";

import type { Comic } from "@app/api";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Inbox, Tag } from "lucide-react";

import { LoadingScreen } from "@/components/LoadingScreen";
import { PageHeader } from "@/components/PageHeader";
import {
  Badge,
  formatStatusLabel,
  gradeBadgeVariant,
  statusBadgeVariant,
} from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCatalog } from "@/contexts/CatalogProvider";
import { useSearch } from "@/contexts/SearchContext";

type StatusFilter = "all" | Comic["status"];

const STATUS_FILTERS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in_inventory", label: "In Inventory" },
  { id: "listed", label: "Listed" },
  { id: "sold", label: "Sold" },
];

export default function CatalogPage() {
  const { entries, loading, error } = useCatalog();
  const { query } = useSearch();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter(({ comic }) => {
      if (statusFilter !== "all" && comic.status !== statusFilter) return false;
      if (!needle) return true;
      const title = (comic.title ?? "").toLowerCase();
      const issue = (comic.issue ?? "").toLowerCase();
      const cert = comic.cert_number.toLowerCase();
      return (
        title.includes(needle) ||
        issue.includes(needle) ||
        cert.includes(needle)
      );
    });
  }, [entries, statusFilter, query]);

  return (
    <>
      <PageHeader
        title="Catalog"
        subtitle="Manage your complete comic inventory."
        actions={
          <Link href="/intake">
            <Button className="gap-2">
              <Inbox className="h-4 w-4" />
              Add comics
            </Button>
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setStatusFilter(filter.id)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              statusFilter === filter.id
                ? "border-accent bg-accent text-foreground"
                : "border-surface-border bg-surface text-muted hover:text-foreground"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mb-4 text-sm text-danger">{error}</p>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Cover</th>
                <th className="px-4 py-3 font-semibold">Title</th>
                <th className="px-4 py-3 font-semibold">Issue</th>
                <th className="px-4 py-3 font-semibold">Grade</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Cost basis</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <LoadingScreen compact message="Loading catalog…" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    No comics match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map(({ comic, coverUrl }) => {
                  const grade =
                    comic.grade != null
                      ? Number(comic.grade).toFixed(1)
                      : "—";
                  return (
                    <tr
                      key={comic.id}
                      className="border-b border-surface-border/70 transition hover:bg-input/40"
                    >
                      <td className="px-4 py-3">
                        <Link href={`/catalog/${comic.id}`} className="block">
                          <div className="flex h-14 w-10 items-center justify-center overflow-hidden rounded-md border border-surface-border bg-input">
                            {coverUrl ? (
                              <Image
                                src={coverUrl}
                                alt=""
                                width={40}
                                height={56}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-[10px] text-muted">N/A</span>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/catalog/${comic.id}`}
                          className="font-medium text-foreground hover:text-accent"
                        >
                          {comic.title || "Untitled comic"}
                        </Link>
                        <p className="text-xs text-muted">
                          Cert {comic.cert_number}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {comic.issue ? `#${comic.issue}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={gradeBadgeVariant(comic.grader)}>
                          {comic.grader} {grade}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusBadgeVariant(comic.status)}>
                          {formatStatusLabel(comic.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {comic.acquired_cost != null
                          ? `$${Number(comic.acquired_cost).toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {comic.status === "in_inventory" ? (
                            <Link href={`/catalog/${comic.id}/sell`}>
                              <Button variant="secondary" className="gap-1 px-3 py-1.5 text-xs">
                                <Tag className="h-3.5 w-3.5" />
                                Sell Now
                              </Button>
                            </Link>
                          ) : null}
                          <Link href={`/catalog/${comic.id}/edit`}>
                            <Button variant="ghost" className="px-3 py-1.5 text-xs">
                              Edit
                            </Button>
                          </Link>
                        </div>
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
