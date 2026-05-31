type BadgeVariant =
  | "default"
  | "accent"
  | "cgc"
  | "cbcs"
  | "listed"
  | "sold"
  | "success"
  | "muted";

const variants: Record<BadgeVariant, string> = {
  default: "border-surface-border bg-input text-foreground",
  accent: "border-accent/40 bg-accent/15 text-accent",
  cgc: "border-accent/40 bg-accent/15 text-accent",
  cbcs: "border-blue-500/40 bg-blue-500/15 text-blue-300",
  listed: "border-amber-500/40 bg-amber-500/15 text-amber-300",
  sold: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  muted: "border-surface-border bg-input text-muted",
};

export function Badge({
  children,
  variant = "default",
  className = "",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function gradeBadgeVariant(grader: string): BadgeVariant {
  return grader === "CBCS" ? "cbcs" : "cgc";
}

export function statusBadgeVariant(
  status: string,
): BadgeVariant {
  if (status === "listed") return "listed";
  if (status === "sold") return "sold";
  return "muted";
}

export function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
