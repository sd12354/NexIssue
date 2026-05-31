"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthForm } from "../../components/AuthForm";
import { LoadingScreen } from "../../components/LoadingScreen";
import { SiteHeader } from "../../components/SiteHeader";
import { useAuth } from "../../contexts/AuthProvider";

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, session, loading } = useAuth();
  const [confirmationSent, setConfirmationSent] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      router.replace("/catalog");
    }
  }, [loading, session, router]);

  const handleSubmit = async (email: string, password: string) => {
    const result = await signUp(email, password);
    if (result.needsEmailConfirmation) {
      setConfirmationSent(true);
      return;
    }
    router.replace("/catalog");
  };

  if (loading || session) {
    return <LoadingScreen message={session ? "Opening app…" : "Loading…"} />;
  }

  if (confirmationSent) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
          <h1 className="text-2xl font-bold text-foreground">Check your email</h1>
          <p className="text-muted">
            We sent a confirmation link. Open it to activate your account, then
            sign in.
          </p>
          <Link
            href="/login"
            className="rounded-card bg-accent px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-accent-pressed"
          >
            Back to sign in
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <AuthForm
          title="Create your account"
          subtitle="Start cataloging slabs in minutes"
          submitLabel="Sign up"
          onSubmit={handleSubmit}
          footer={
            <p className="text-sm text-muted">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-accent">
                Sign in
              </Link>
            </p>
          }
        />
      </main>
    </div>
  );
}
