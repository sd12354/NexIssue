"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AuthForm } from "../../components/AuthForm";
import { LoadingScreen } from "../../components/LoadingScreen";
import { SiteHeader } from "../../components/SiteHeader";
import { useAuth } from "../../contexts/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) {
      router.replace("/catalog");
    }
  }, [loading, session, router]);

  if (loading || session) {
    return <LoadingScreen message={session ? "Opening app…" : "Loading…"} />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <AuthForm
          title="Welcome back"
          subtitle="Sign in to manage your graded comics"
          submitLabel="Sign in"
          onSubmit={signIn}
          footer={
            <p className="text-sm text-muted">
              No account?{" "}
              <Link href="/signup" className="font-semibold text-accent">
                Sign up
              </Link>
            </p>
          }
        />
      </main>
    </div>
  );
}
