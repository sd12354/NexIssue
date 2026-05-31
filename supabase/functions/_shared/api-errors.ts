/** Turn upstream HTML/JSON errors into short user-facing copy. */
export function userFacingApiError(
  err: unknown,
  fallback: string,
): string {
  const raw = err instanceof Error ? err.message : fallback;

  if (/error 522|connection timed out|cloudflare/i.test(raw)) {
    return "Service temporarily unreachable. Try again in a few minutes.";
  }

  if (/error 429|rate limit/i.test(raw)) {
    return "Rate limit hit. Wait a moment and try again.";
  }

  if (raw.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        return parsed.detail.length > 140
          ? `${parsed.detail.slice(0, 137)}…`
          : parsed.detail;
      }
      if (typeof parsed.title === "string" && parsed.title.trim()) {
        return parsed.title;
      }
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message;
      }
    } catch {
      // not JSON
    }
    return fallback;
  }

  if (raw.trimStart().startsWith("<")) {
    return fallback;
  }

  return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw;
}
