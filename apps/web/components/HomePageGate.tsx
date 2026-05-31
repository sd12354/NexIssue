"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "../contexts/AuthProvider";

export function HomePageGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) {
      router.replace("/catalog");
    }
  }, [loading, session, router]);

  if (loading) {
    return null;
  }

  if (session) {
    return null;
  }

  return children;
}
