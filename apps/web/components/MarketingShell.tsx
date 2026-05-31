import type { ReactNode } from "react";

import { SiteHeader } from "./SiteHeader";

type MarketingShellProps = {
  children: ReactNode;
  centered?: boolean;
};

export function MarketingShell({
  children,
  centered = false,
}: MarketingShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main
        className={`mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-10 sm:px-8 ${
          centered ? "items-center justify-center text-center" : ""
        }`}
      >
        {children}
      </main>
    </div>
  );
}
