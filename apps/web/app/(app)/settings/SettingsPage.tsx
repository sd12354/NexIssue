"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Bell, Sliders, Users } from "lucide-react";

import { IntegrationsPanel } from "@/components/settings/IntegrationsPanel";
import { ShippingPanel } from "@/components/settings/ShippingPanel";
import { PageHeader } from "@/components/PageHeader";
import { PhasePlaceholder } from "@/components/PhasePlaceholder";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthProvider";

const TABS = [
  { id: "integrations", label: "Integrations" },
  { id: "shipping", label: "Shipping" },
  { id: "rules", label: "Listing Rules" },
  { id: "organization", label: "Organization" },
  { id: "notifications", label: "Notifications" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signOut, user } = useAuth();
  const tab = (searchParams?.get("tab") as TabId) || "integrations";

  const setTab = (next: TabId) => {
    router.push(`/settings?tab=${next}`);
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
  };

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage your account, integrations, and preferences."
        actions={
          <Button variant="secondary" onClick={() => void handleSignOut()}>
            Sign out
          </Button>
        }
      />

      {user?.email ? (
        <p className="-mt-4 mb-4 text-sm text-muted">Signed in as {user.email}</p>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2 border-b border-surface-border pb-3">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === item.id
                ? "bg-input text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "integrations" ? <IntegrationsPanel /> : null}

      {tab === "shipping" ? <ShippingPanel /> : null}

      {tab === "rules" ? (
        <PhasePlaceholder
          icon={Sliders}
          title="Listing Rules"
          phase="Phase 3"
          description="Auto-publish rules and review thresholds come in Phase 3 (Listing automation)."
        />
      ) : null}

      {tab === "organization" ? (
        <PhasePlaceholder
          icon={Users}
          title="Organization"
          phase="Phase 8"
          description="Org invites, roles, and multi-user administration come in Phase 8 (SaaS launch)."
        />
      ) : null}

      {tab === "notifications" ? (
        <PhasePlaceholder
          icon={Bell}
          title="Notifications"
          phase="Phase 6"
          description="Sale and delivery push notifications are sent to the mobile app. Email preferences come in Phase 6."
        />
      ) : null}
    </>
  );
}
