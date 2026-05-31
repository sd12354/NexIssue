import { Brain } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export default function AdvisorPage() {
  return (
    <>
      <PageHeader
        title="AI Investment Advisor"
        subtitle="Get data-driven buy, sell, and hold recommendations."
      />
      <PhasePlaceholder
        icon={Brain}
        title="Advisor"
        phase="Phase 5"
        description="Buy / sell / hold recommendations come in Phase 5."
      />
    </>
  );
}
