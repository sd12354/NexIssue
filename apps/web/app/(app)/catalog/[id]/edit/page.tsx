"use client";

import { updateComic, type Comic, type ComicUpdate } from "@app/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useCatalog } from "@/contexts/CatalogProvider";
import { getSupabase } from "@/lib/supabase";

type EditableFields = {
  title: string;
  issue: string;
  variant: string;
  grade: string;
  year: string;
  encapsulationDate: string;
  keyNotes: string;
  acquiredCost: string;
  acquiredSource: string;
};

function comicToFields(comic: Comic): EditableFields {
  return {
    title: comic.title ?? "",
    issue: comic.issue ?? "",
    variant: comic.variant ?? "",
    grade: comic.grade != null ? String(comic.grade) : "",
    year: comic.year != null ? String(comic.year) : "",
    encapsulationDate: comic.encapsulation_date ?? "",
    keyNotes: (comic.key_notes ?? []).join("\n"),
    acquiredCost:
      comic.acquired_cost != null ? String(comic.acquired_cost) : "",
    acquiredSource: comic.acquired_source ?? "",
  };
}

function parseNumber(input: string): number | null {
  if (!input.trim()) return null;
  const value = Number.parseFloat(input);
  return Number.isNaN(value) ? null : value;
}

function parseInt10(input: string): number | null {
  if (!input.trim()) return null;
  const value = Number.parseInt(input, 10);
  return Number.isNaN(value) ? null : value;
}

function fieldsToUpdate(fields: EditableFields): ComicUpdate {
  return {
    title: fields.title.trim() || null,
    issue: fields.issue.trim() || null,
    variant: fields.variant.trim() || null,
    grade: parseNumber(fields.grade),
    year: parseInt10(fields.year),
    encapsulation_date: fields.encapsulationDate.trim() || null,
    key_notes: fields.keyNotes
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    acquired_cost: parseNumber(fields.acquiredCost),
    acquired_source: fields.acquiredSource.trim() || null,
  };
}

function Field({
  label,
  value,
  onChange,
  multiline,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  const className =
    "w-full rounded-card border border-surface-border bg-input px-3 py-2.5 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {multiline ? (
        <textarea
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${className} min-h-[88px]`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={className}
        />
      )}
    </label>
  );
}

export default function EditComicPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { getEntry, refresh } = useCatalog();
  const entry = getEntry(params.id);
  const [fields, setFields] = useState<EditableFields | null>(() =>
    entry ? comicToFields(entry.comic) : null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    <K extends keyof EditableFields>(key: K, value: EditableFields[K]) => {
      setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  if (!entry || !fields) {
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

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateComic(
        getSupabase(),
        comic.org_id,
        comic.id,
        fieldsToUpdate(fields),
      );
      await refresh();
      router.push(`/catalog/${comic.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Link
        href={`/catalog/${comic.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-foreground hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to comic
      </Link>

      <h1 className="text-2xl font-bold text-foreground">Edit comic</h1>

      <Card className="mt-4 flex gap-3 p-4">
        <span className="text-sm font-bold text-accent">{comic.grader}</span>
        <span className="font-mono text-sm font-semibold">{comic.cert_number}</span>
      </Card>

      <div className="mt-4 space-y-4">
        <Field label="Title" value={fields.title} onChange={(v) => update("title", v)} />
        <Field label="Issue" value={fields.issue} onChange={(v) => update("issue", v)} />
        <Field label="Grade" value={fields.grade} onChange={(v) => update("grade", v)} type="number" />
        <Field label="Year" value={fields.year} onChange={(v) => update("year", v)} type="number" />
        <Field label="Variant" value={fields.variant} onChange={(v) => update("variant", v)} />
        <Field
          label="Encapsulation date"
          value={fields.encapsulationDate}
          onChange={(v) => update("encapsulationDate", v)}
          type="date"
        />
        <Field
          label="Key notes"
          value={fields.keyNotes}
          onChange={(v) => update("keyNotes", v)}
          multiline
        />
        <Field
          label="Acquired cost (USD)"
          value={fields.acquiredCost}
          onChange={(v) => update("acquiredCost", v)}
          type="number"
        />
        <Field
          label="Acquired from"
          value={fields.acquiredSource}
          onChange={(v) => update("acquiredSource", v)}
        />
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      <Button
        className="mt-6 w-full py-3"
        disabled={saving}
        onClick={() => void handleSave()}
      >
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </>
  );
}
