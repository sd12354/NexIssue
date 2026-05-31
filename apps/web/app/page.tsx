import Link from "next/link";

import { BrandLogo } from "../components/BrandLogo";
import { HomePageGate } from "../components/HomePageGate";
import { MarketingShell } from "../components/MarketingShell";

export default function HomePage() {
  return (
    <MarketingShell centered>
      <HomePageGate>
        <div className="flex max-w-2xl flex-col items-center gap-6">
          <BrandLogo size={96} priority className="h-24 w-24" />

        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            NexIssue
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            Graded comics, from slab to sold
          </h1>
        </div>

        <p className="max-w-xl text-base leading-7 text-muted sm:text-lg">
          NexIssue is an operations platform for graded comic resellers. Scan
          slabs on mobile, manage your catalog on the web, auto-generate eBay
          listings, and track what to buy, sell, or hold — all in one place.
        </p>

        <p className="max-w-xl text-sm leading-6 text-muted">
          Built for solo operators and small dealers who want to cut intake-to-listed
          time from minutes of manual work down to a few taps. Your inventory,
          integrations, and listing history stay in sync across iOS, Android, and
          the web.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/signup"
            className="rounded-card bg-accent px-6 py-3.5 text-sm font-semibold text-foreground transition hover:bg-accent-pressed"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="rounded-card border border-surface-border bg-surface px-6 py-3.5 text-sm font-semibold text-foreground transition hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
        </div>
      </HomePageGate>
    </MarketingShell>
  );
}
