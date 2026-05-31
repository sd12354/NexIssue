import type { LucideIcon } from "lucide-react";

import { Card } from "./ui/Card";

export function PhasePlaceholder({
  icon: Icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  phase?: string;
}) {
  return (
    <Card className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-card border border-surface-border bg-input">
        <Icon className="h-7 w-7 text-accent" strokeWidth={1.75} />
      </div>
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      {phase ? (
        <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-accent">
          {phase}
        </p>
      ) : null}
      <p className="mt-3 max-w-md text-sm leading-6 text-muted">{description}</p>
    </Card>
  );
}
