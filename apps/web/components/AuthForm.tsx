"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";

import { BrandLogo } from "./BrandLogo";

type AuthFormProps = {
  title: string;
  subtitle: string;
  submitLabel: string;
  footer?: ReactNode;
  onSubmit: (email: string, password: string) => Promise<void>;
};

export function AuthForm({
  title,
  subtitle,
  submitLabel,
  footer,
  onSubmit,
}: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-md space-y-3">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <BrandLogo size={64} priority />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>

      <label className="block">
        <span className="sr-only">Email</span>
        <input
          type="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-card border border-surface-border bg-input px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          required
        />
      </label>

      <label className="block">
        <span className="sr-only">Password</span>
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-card border border-surface-border bg-input px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          required
        />
      </label>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 w-full rounded-card bg-accent py-4 text-base font-semibold text-foreground transition hover:bg-accent-pressed disabled:opacity-70"
      >
        {submitting ? "Please wait…" : submitLabel}
      </button>

      {footer ? <div className="pt-4 text-center">{footer}</div> : null}
    </form>
  );
}
