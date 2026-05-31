"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { useAuth } from "@/contexts/AuthProvider";

type HomeLinkProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

export function HomeLink({ children, className = "", title }: HomeLinkProps) {
  const { session, loading } = useAuth();
  const href = !loading && session ? "/catalog" : "/";

  return (
    <Link href={href} className={className} title={title}>
      {children}
    </Link>
  );
}
