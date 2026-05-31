import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-foreground hover:bg-accent-pressed disabled:opacity-60",
  secondary:
    "border border-surface-border bg-surface text-foreground hover:opacity-90 disabled:opacity-60",
  ghost: "text-muted hover:bg-surface hover:text-foreground disabled:opacity-60",
  danger:
    "border border-danger/40 bg-surface text-danger hover:bg-danger/10 disabled:opacity-60",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-card px-4 py-2.5 text-sm font-semibold transition ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
