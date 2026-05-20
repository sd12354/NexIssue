export type Grader = "CGC" | "CBCS";

export type ParsedCert = {
  grader: Grader;
  certNumber: string;
};

const CGC_HOSTS = ["cgccomics.com", "cgccards.com", "m.cgccomics.com"];
const CBCS_HOSTS = ["cbcscomics.com", "www.cbcscomics.com"];

function hostMatches(host: string, candidates: string[]): boolean {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return candidates.some(
    (candidate) =>
      normalized === candidate.replace(/^www\./, "") ||
      normalized.endsWith(`.${candidate.replace(/^www\./, "")}`),
  );
}

function extractCertFromPath(pathname: string): string | null {
  const match = pathname.match(/\/certlookup\/?([^/?#]+)?/i);
  if (!match?.[1]) return null;
  const certNumber = decodeURIComponent(match[1]).trim();
  return certNumber.length > 0 ? certNumber : null;
}

function extractCertFromQuery(searchParams: URLSearchParams): string | null {
  for (const key of ["cert", "certNumber", "certnumber", "id"]) {
    const value = searchParams.get(key)?.trim();
    if (value) return value;
  }
  return null;
}

/**
 * Parses CGC/CBCS certification QR URLs into grader + cert number.
 * @see PRD Section 4.1 — intake via slab QR
 */
export function parseCertUrl(url: string): ParsedCert | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase();

    let grader: Grader | null = null;
    if (hostMatches(host, CGC_HOSTS)) {
      grader = "CGC";
    } else if (hostMatches(host, CBCS_HOSTS)) {
      grader = "CBCS";
    } else {
      return null;
    }

    const certNumber =
      extractCertFromPath(parsed.pathname) ??
      extractCertFromQuery(parsed.searchParams);
    if (!certNumber) return null;

    return { grader, certNumber };
  } catch {
    return null;
  }
}
