"use client";

import { LayoutGrid } from "lucide-react";

import { LoadingScreen } from "@/components/LoadingScreen";
import { PageHeader } from "@/components/PageHeader";
import { PhasePlaceholder } from "@/components/PhasePlaceholder";
import { useCatalog } from "@/contexts/CatalogProvider";

export default function DashboardPage() {
  const { loading, entries } = useCatalog();

  if (loading && entries.length === 0) {
    return <LoadingScreen compact message="Loading dashboard…" />;
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Portfolio overview and activity feed."
      />
      <PhasePlaceholder
        icon={LayoutGrid}
        title="Dashboard"
        phase="Phase 7"
        description="Portfolio overview, charts, and activity feed come in Phase 7."
      />
    </>
  );
}
