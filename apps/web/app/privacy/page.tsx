import type { Metadata } from "next";

import { MarketingShell } from "../../components/MarketingShell";

export const metadata: Metadata = {
  title: "Privacy",
};

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            Privacy
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Privacy policy
          </h1>
          <p className="text-sm text-muted">Last updated: May 2026</p>
        </div>

        <div className="space-y-4 text-base leading-7 text-muted">
          <p>
            NexIssue is a private operations tool for managing graded comic
            inventory. This page summarizes how we handle your data during the
            current early-access phase.
          </p>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              What we collect
            </h2>
            <p>
              Account email and password (via Supabase Auth), comic catalog
              data you enter or scan, photos you upload, and integration
              metadata such as connected marketplace account names. OAuth tokens
              for eBay and other providers are encrypted server-side and are not
              exposed to the client.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              How we use it
            </h2>
            <p>
              Your data powers catalog management, listing automation, and
              organization-scoped features within your account. We do not sell
              your inventory or personal information.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">
              Storage & security
            </h2>
            <p>
              Data is stored in Supabase (PostgreSQL and object storage) with
              row-level security scoped to your organization. Marketplace
              credentials are encrypted at rest using AES-256-GCM in edge
              functions.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Contact</h2>
            <p>
              Questions about this policy can be directed to the NexIssue
              account owner during the household early-access period. A formal
              contact address will be published before public launch.
            </p>
          </section>
        </div>
      </div>
    </MarketingShell>
  );
}
