"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandLogo } from "./BrandLogo";
import { HomeLink } from "./HomeLink";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../contexts/AuthProvider";

type NavLinkProps = {
  href: string;
  label: string;
  active?: boolean;
  variant?: "ghost" | "accent";
};

function NavLink({ href, label, active, variant = "ghost" }: NavLinkProps) {
  if (variant === "accent") {
    return (
      <Link
        href={href}
        className="rounded-card bg-accent px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent-pressed"
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "text-foreground"
          : "text-muted hover:bg-surface hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname() ?? "";
  const { session, loading } = useAuth();

  return (
    <header className="border-b border-surface-border bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-5 sm:gap-4">
        <HomeLink
          className="flex min-w-0 items-center gap-2 rounded-lg transition hover:opacity-90"
          title="NexIssue home"
        >
          <BrandLogo size={28} className="shrink-0" />
          <span className="truncate text-sm font-bold text-foreground">
            NexIssue
          </span>
        </HomeLink>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <NavLink href="/about" label="About" active={pathname === "/about"} />
          <NavLink
            href="/privacy"
            label="Privacy"
            active={pathname === "/privacy"}
          />
          <ThemeToggle />
          {!loading && session ? (
            <NavLink href="/catalog" label="Open app" variant="accent" />
          ) : pathname === "/login" ? (
            <NavLink href="/signup" label="Sign up" variant="accent" />
          ) : pathname === "/signup" ? (
            <NavLink href="/login" label="Login" variant="accent" />
          ) : (
            <NavLink href="/login" label="Login" variant="accent" />
          )}
        </div>
      </div>
    </header>
  );
}
