"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Brain,
  ChevronLeft,
  DollarSign,
  Inbox,
  LayoutGrid,
  Settings,
  Tag,
} from "lucide-react";
import { useState } from "react";

import { BrandLogo } from "./BrandLogo";
import { HomeLink } from "./HomeLink";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  match?: (path: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutGrid,
    match: (p) => p === "/dashboard",
  },
  {
    href: "/catalog",
    label: "Catalog",
    icon: BookOpen,
    match: (p) => p.startsWith("/catalog"),
  },
  {
    href: "/listings",
    label: "Listings",
    icon: Tag,
    match: (p) => p.startsWith("/listings"),
  },
  {
    href: "/sales",
    label: "Sales",
    icon: DollarSign,
    match: (p) => p.startsWith("/sales"),
  },
  {
    href: "/advisor",
    label: "Advisor",
    icon: Brain,
    match: (p) => p.startsWith("/advisor"),
  },
  {
    href: "/intake",
    label: "Manual Intake",
    icon: Inbox,
    match: (p) => p.startsWith("/intake"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    match: (p) => p.startsWith("/settings"),
  },
];

export function Sidebar() {
  const pathname = usePathname() ?? "";
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`relative flex shrink-0 flex-col border-r border-surface-border bg-surface transition-all ${
        collapsed ? "w-[68px]" : "w-56"
      }`}
    >
      <div className="flex h-14 items-center gap-2 border-b border-surface-border px-3">
        <HomeLink
          className={`flex min-w-0 items-center gap-2 rounded-lg transition hover:opacity-90 ${collapsed ? "justify-center" : ""}`}
          title="NexIssue home"
        >
          <BrandLogo size={28} className="shrink-0" />
          {!collapsed ? (
            <span className="truncate text-sm font-bold text-foreground">
              NexIssue
            </span>
          ) : null}
        </HomeLink>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-input hover:text-foreground ${collapsed ? "absolute right-2 top-3" : "ml-auto"}`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            className={`h-4 w-4 transition ${collapsed ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match ? match(pathname) : pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:bg-input hover:text-foreground"
              } ${collapsed ? "justify-center px-2" : ""}`}
            >
              {active ? (
                <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full bg-accent" />
              ) : null}
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              {!collapsed ? <span>{label}</span> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
