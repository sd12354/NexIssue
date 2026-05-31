import type { Metadata } from "next";

import { MarketingShell } from "../../components/MarketingShell";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            About
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            What is NexIssue?
          </h1>
        </div>

        <div className="space-y-4 text-base leading-7 text-muted">
          <p>
            NexIssue helps graded comic resellers move books from physical
            receipt to listed-and-sold without juggling a dozen disconnected
            tools. The mobile app handles scanning slabs, capturing photos, and
            field workflows. The web app is built for desk work: catalog
            management, listing review, integrations, and portfolio decisions.
          </p>
          <p>
            Both apps share the same Supabase backend, so your inventory,
            photos, eBay connection, and listing history are always in sync.
          </p>
        </div>

        <section className="rounded-card border border-surface-border bg-surface p-5">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            What you can do today
          </h2>
          <ul className="space-y-2 text-sm leading-6 text-muted">
            <li>Scan CGC and CBCS slabs and build a graded comic catalog</li>
            <li>Connect eBay and publish listings with auto-generated copy</li>
            <li>Filter and search inventory by status, title, and issue</li>
            <li>Manage org settings and marketplace integrations</li>
          </ul>
        </section>

        <section className="rounded-card border border-surface-border bg-surface p-5">
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            Coming on web
          </h2>
          <ul className="space-y-2 text-sm leading-6 text-muted">
            <li>Full catalog management with bulk operations</li>
            <li>Listing review, sales tracking, and advisor recommendations</li>
            <li>Manual cert entry for books without mobile scanning</li>
          </ul>
        </section>
      </div>
    </MarketingShell>
  );
}
