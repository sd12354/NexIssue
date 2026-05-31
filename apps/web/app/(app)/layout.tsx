"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { LoadingScreen } from "@/components/LoadingScreen";
import { CatalogProvider } from "@/contexts/CatalogProvider";
import { SearchProvider } from "@/contexts/SearchContext";
import { useAuth } from "@/contexts/AuthProvider";

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return <LoadingScreen />;
  }

  return (
    <SearchProvider>
      <CatalogProvider>
        <AppShell>{children}</AppShell>
      </CatalogProvider>
    </SearchProvider>
  );
}
