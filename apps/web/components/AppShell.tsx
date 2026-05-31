"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <div className="flex-1 overflow-auto p-5 sm:p-6">{children}</div>
      </div>
      <Link
        href="/about"
        className="fixed bottom-5 right-5 flex h-9 w-9 items-center justify-center rounded-full border border-surface-border bg-surface text-sm font-semibold text-muted shadow-lg transition hover:text-foreground"
        title="Help"
      >
        ?
      </Link>
    </div>
  );
}
