export function formatPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function formatPricingNote(message: string | undefined): string | undefined {
  if (!message) return undefined;
  if (/error 522|cloudflare|connection timed out|temporarily unavailable/i.test(message)) {
    return "Pricing service temporarily unreachable. Tap refresh to try again.";
  }
  if (/sandbox has almost no active listings/i.test(message)) {
    return message;
  }
  if (message.trimStart().startsWith("{")) {
    return "Could not load comps right now. Tap refresh to try again.";
  }
  return message.length > 180 ? `${message.slice(0, 177)}…` : message;
}

export function formatTimeAgo(iso: string | null): string {
  if (!iso) return "never";
  const elapsed = Date.now() - Date.parse(iso);
  if (elapsed < 60_000) return "just now";

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;

  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
