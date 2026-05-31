"use client";

import {
  createComic,
  lookupCert,
  type CertLookupResult,
  type Grader,
} from "@app/api";
import Link from "next/link";
import { useCallback, useState } from "react";

import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthProvider";
import { useCatalog } from "@/contexts/CatalogProvider";
import { getSupabase } from "@/lib/supabase";

type EnrichedRow = {
  certNumber: string;
  grader: Grader;
  status: "pending" | "success" | "failed";
  result?: CertLookupResult;
  error?: string;
};

function parseCertLines(raw: string): Array<{ certNumber: string; grader: Grader }> {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const cgc = line.match(/^CGC[\s:-]*(\d+)/i);
    if (cgc) return { certNumber: cgc[1], grader: "CGC" as Grader };
    const cbcs = line.match(/^CBCS[\s:-]*(\d+)/i);
    if (cbcs) return { certNumber: cbcs[1], grader: "CBCS" as Grader };
    const digits = line.replace(/\D/g, "");
    return { certNumber: digits || line, grader: "CGC" as Grader };
  });
}

export default function IntakePage() {
  const { user } = useAuth();
  const { orgId, refresh } = useCatalog();
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<EnrichedRow[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleEnrich = useCallback(async () => {
    const parsed = parseCertLines(input);
    if (parsed.length === 0) return;
    setEnriching(true);
    setMessage(null);
    const supabase = getSupabase();
    const initial: EnrichedRow[] = parsed.map(({ certNumber, grader }) => ({
      certNumber,
      grader,
      status: "pending",
    }));
    setRows(initial);

    const next = [...initial];
    for (let i = 0; i < parsed.length; i += 1) {
      try {
        const result = await lookupCert(supabase, {
          grader: parsed[i].grader,
          certNumber: parsed[i].certNumber,
        });
        next[i] = {
          ...next[i],
          status: "success",
          result,
        };
      } catch (err) {
        next[i] = {
          ...next[i],
          status: "failed",
          error: err instanceof Error ? err.message : "Lookup failed",
        };
      }
      setRows([...next]);
    }
    setEnriching(false);
  }, [input]);

  const handleSaveAll = useCallback(async () => {
    if (!orgId || !user) return;
    const successes = rows.filter((r) => r.status === "success" && r.result);
    if (successes.length === 0) return;
    setSaving(true);
    setMessage(null);
    try {
      const supabase = getSupabase();
      for (const row of successes) {
        const r = row.result!;
        await createComic(supabase, {
          org_id: orgId,
          cert_number: r.certNumber,
          grader: r.grader,
          title: r.title,
          issue: r.issue,
          variant: r.variant,
          year: r.year,
          grade: r.grade ? Number.parseFloat(r.grade) : null,
          key_notes: r.keyNotes,
          encapsulation_date: r.encapsulationDate,
          status: "in_inventory",
          created_by: user.id,
        });
      }
      await refresh();
      setMessage(`Added ${successes.length} comic(s) to your catalog.`);
      setRows([]);
      setInput("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [orgId, user, rows, refresh]);

  const successCount = rows.filter((r) => r.status === "success").length;

  return (
    <>
      <PageHeader
        title="Manual Intake"
        subtitle="Bulk import comics by pasting cert numbers (one per line)."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            Cert numbers
          </h2>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={10}
            placeholder={`Paste cert numbers here, one per line:\nCGC 12345678\nCBCS 87654321\n1234567890`}
            className="w-full rounded-card border border-surface-border bg-input px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <Button
            className="mt-4 w-full"
            disabled={enriching || !input.trim()}
            onClick={() => void handleEnrich()}
          >
            {enriching ? "Enriching…" : "Enrich All"}
          </Button>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Results</h2>
            {successCount > 0 ? (
              <Button
                variant="secondary"
                className="text-xs"
                disabled={saving}
                onClick={() => void handleSaveAll()}
              >
                {saving ? "Saving…" : `Save All to Catalog (${successCount})`}
              </Button>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">
              No results yet. Paste cert numbers and click Enrich All to begin.
            </p>
          ) : (
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-xs uppercase text-muted">
                    <th className="py-2 pr-2">Cert</th>
                    <th className="py-2 pr-2">Title</th>
                    <th className="py-2 pr-2">Grade</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.grader}-${row.certNumber}`} className="border-b border-surface-border/60">
                      <td className="py-2 pr-2 font-mono text-xs">
                        {row.grader} {row.certNumber}
                      </td>
                      <td className="py-2 pr-2 text-foreground">
                        {row.result?.title ?? "—"}
                      </td>
                      <td className="py-2 pr-2">
                        {row.result?.grade ?? "—"}
                      </td>
                      <td className="py-2">
                        {row.status === "pending" ? (
                          <span className="text-muted">…</span>
                        ) : row.status === "success" ? (
                          <Badge variant="success">OK</Badge>
                        ) : (
                          <span className="text-xs text-danger" title={row.error}>
                            Failed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-6 p-4">
        <h2 className="mb-2 text-sm font-semibold text-foreground">How it works</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-muted">
          <li>Paste cert numbers from your recent purchases (one per line).</li>
          <li>Click Enrich All to look up details from CGC and CBCS.</li>
          <li>Review the enriched data in the results table.</li>
          <li>Click Save All to Catalog to add successful lookups to your inventory.</li>
          <li>
            Failed lookups can be{" "}
            <Link href="/catalog" className="text-accent">
              edited manually
            </Link>{" "}
            from the catalog.
          </li>
        </ol>
      </Card>

      {message ? (
        <p className="mt-4 text-sm text-foreground">{message}</p>
      ) : null}
    </>
  );
}
