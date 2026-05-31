import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 text-center">
      <h1 className="text-3xl font-bold text-foreground">Page not found</h1>
      <p className="mt-3 text-muted">
        That page doesn&apos;t exist. Head back to the NexIssue home page.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-card bg-accent px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-accent-pressed"
      >
        Go home
      </Link>
    </div>
  );
}
