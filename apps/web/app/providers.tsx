"use client";

import type { ReactNode } from "react";

import { AuthProvider } from "../contexts/AuthProvider";
import { ThemeProvider } from "../contexts/ThemeProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
