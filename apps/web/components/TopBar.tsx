"use client";

import { Bell, Search, User } from "lucide-react";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../contexts/AuthProvider";
import { useSearch } from "../contexts/SearchContext";

export function TopBar() {
  const pathname = usePathname() ?? "";
  const { query, setQuery } = useSearch();
  const { user } = useAuth();
  const catalogActive = pathname.startsWith("/catalog");

  return (
    <header className="flex h-14 items-center gap-4 border-b border-surface-border bg-background px-5">
      <div className="relative mx-auto w-full max-w-xl flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            catalogActive
              ? "Search comics, issues, or certs…"
              : "Search comics, issues, or certs… (filters Catalog)"
          }
          className="w-full rounded-card border border-surface-border bg-input py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <button
          type="button"
          className="rounded-lg p-2 text-muted transition hover:bg-surface hover:text-foreground"
          aria-label="Notifications"
          title="Notifications — Phase 6"
        >
          <Bell className="h-[18px] w-[18px]" />
        </button>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full border border-surface-border bg-surface text-muted"
          title={user?.email ?? "Account"}
        >
          <User className="h-4 w-4" />
        </div>
      </div>
    </header>
  );
}
