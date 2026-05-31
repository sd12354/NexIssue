/**
 * eBay Browse API — active listing comps (PRD §5.3, §9).
 *
 * Uses the client-credentials application token (no user OAuth required).
 */

import {
  type EbayEnv,
  ebayUrls,
  parseEbayOAuthConfig,
} from "./ebay.ts";
import { userFacingApiError } from "./api-errors.ts";
import { fetchWithTimeout } from "./fetch.ts";

const BROWSE_SCOPE = "https://api.ebay.com/oauth/api_scope";
const DEFAULT_CATEGORY_ID = "259104";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const BACKOFF_MS = [800, 2_000];

export type ActiveListingComp = {
  price: number;
  gradeMatched: boolean;
};

export class EbayBrowseError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = "EbayBrowseError";
  }
}

let cachedAppToken: { token: string; expiresAt: number; env: EbayEnv } | null =
  null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function browseBaseUrl(env: EbayEnv): string {
  return env === "sandbox"
    ? "https://api.sandbox.ebay.com/buy/browse/v1"
    : "https://api.ebay.com/buy/browse/v1";
}

function formatGrade(grade: number | null): string | null {
  if (grade == null || !Number.isFinite(grade)) return null;
  return Number(grade).toFixed(1);
}

function buildSearchQuery(input: {
  title: string | null;
  issue: string | null;
}): string | null {
  if (!input.title?.trim()) return null;
  return [input.title.trim(), input.issue?.trim() ? `#${input.issue.trim()}` : null]
    .filter(Boolean)
    .join(" ");
}

function buildSearchQueries(input: {
  title: string | null;
  issue: string | null;
  grade: number | null;
  grader: string;
}): string[] {
  const base = buildSearchQuery({ title: input.title, issue: input.issue });
  if (!base) return [];

  const gradeText = formatGrade(input.grade);
  const grader = input.grader.toUpperCase();
  const queries = new Set<string>([base]);

  if (gradeText) {
    queries.add(`${base} ${grader} ${gradeText}`);
    queries.add(`${base} ${grader}${gradeText.replace(".", "")}`);
  }

  if (input.title?.trim()) {
    queries.add(input.title.trim());
  }

  return [...queries];
}

function resolveBrowseEnv(configured: string | null | undefined): EbayEnv {
  const raw = (configured ?? "production").trim().toLowerCase();
  return raw === "sandbox" || raw === "sbx" ? "sandbox" : "production";
}

export type EbayBrowseCredentials = {
  clientId: string;
  clientSecret: string;
  env: EbayEnv;
};

/** Prefer dedicated production Browse keys; otherwise match OAuth credential env. */
export function resolveEbayBrowseCredentials(input: {
  oauthClientId?: string | null;
  oauthClientSecret?: string | null;
  oauthEnv?: string | null;
  browseClientId?: string | null;
  browseClientSecret?: string | null;
  browseEnv?: string | null;
}): EbayBrowseCredentials | null {
  const browseClientId = input.browseClientId?.trim();
  const browseClientSecret = input.browseClientSecret?.trim();
  if (browseClientId && browseClientSecret) {
    return {
      clientId: browseClientId,
      clientSecret: browseClientSecret,
      env: resolveBrowseEnv(input.browseEnv ?? "production"),
    };
  }

  const oauthClientId = input.oauthClientId?.trim();
  const oauthClientSecret = input.oauthClientSecret?.trim();
  if (!oauthClientId || !oauthClientSecret) return null;

  const oauthEnv = resolveBrowseEnv(input.oauthEnv ?? "production");
  const browseEnv = input.browseEnv?.trim()
    ? resolveBrowseEnv(input.browseEnv)
    : oauthEnv;

  return {
    clientId: oauthClientId,
    clientSecret: oauthClientSecret,
    env: browseEnv,
  };
}

function parseListingPrice(item: Record<string, unknown>): number | null {
  const price = item.price as Record<string, unknown> | undefined;
  const bid = item.currentBidPrice as Record<string, unknown> | undefined;
  const raw = price?.value ?? bid?.value;
  if (typeof raw === "string") {
    const parsed = Number(raw.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  if (typeof raw === "number" && raw > 0) return raw;
  return null;
}

function listingMatchesGrade(
  title: string,
  grade: number | null,
  grader: string,
): boolean {
  if (grade == null) return true;
  const normalized = title.toLowerCase();
  const graderToken = grader.toLowerCase();
  const gradeText = formatGrade(grade);
  if (!gradeText) return true;

  const patterns = [
    `${graderToken} ${gradeText}`,
    `${graderToken}${gradeText.replace(".", "")}`,
    `grade ${gradeText}`,
    ` ${gradeText} `,
  ];

  return patterns.some((pattern) => normalized.includes(pattern.trim()));
}

async function getApplicationAccessToken(
  env: EbayEnv,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  if (
    cachedAppToken &&
    cachedAppToken.env === env &&
    cachedAppToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedAppToken.token;
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  let response: Response;
  try {
    response = await fetchWithTimeout(
      ebayUrls(env).token,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: BROWSE_SCOPE,
        }).toString(),
      },
      REQUEST_TIMEOUT_MS,
    );
  } catch (err) {
    throw new EbayBrowseError(
      "ebay_browse_auth_failed",
      userFacingApiError(err, "Could not reach eBay to obtain an application token."),
      502,
    );
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    const hint = env === "sandbox"
      ? " For real active listings, set EBAY_BROWSE_CLIENT_ID and EBAY_BROWSE_CLIENT_SECRET to production app keys."
      : "";
    throw new EbayBrowseError(
      "ebay_browse_auth_failed",
      userFacingApiError(
        new Error(detail),
        `Could not obtain eBay application token.${hint}`,
      ),
      response.status,
    );
  }

  const json = await response.json() as {
    access_token?: string;
    expires_in?: number;
  };

  if (!json.access_token) {
    throw new EbayBrowseError(
      "ebay_browse_auth_failed",
      "eBay application token response missing access_token.",
    );
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 7200;
  cachedAppToken = {
    token: json.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
    env,
  };

  return json.access_token;
}

async function browseRequest(
  url: string,
  accessToken: string,
): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
          },
        },
        REQUEST_TIMEOUT_MS,
      );
    } catch (err) {
      const timedOut = err instanceof Error && /timed out/i.test(err.message);
      if (timedOut && attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt] ?? 2_000);
        continue;
      }
      throw new EbayBrowseError(
        "ebay_browse_api_error",
        timedOut
          ? "eBay Browse is temporarily unavailable. Try again later."
          : userFacingApiError(err, "eBay Browse request failed."),
        502,
      );
    }

    if (response.status === 429 || response.status === 503 || response.status === 522) {
      if (attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt] ?? 5_000);
        continue;
      }
      throw new EbayBrowseError(
        "rate_limited",
        "eBay Browse is temporarily unavailable. Try again later.",
        429,
      );
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new EbayBrowseError(
        "ebay_browse_api_error",
        userFacingApiError(new Error(detail), `eBay Browse request failed (${response.status}).`),
        response.status >= 500 ? 502 : response.status,
      );
    }

    try {
      return await response.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Invalid JSON");
      if (attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt] ?? 5_000);
        continue;
      }
    }
  }

  throw new EbayBrowseError(
    "ebay_browse_api_error",
    lastError?.message ?? "eBay Browse returned an unreadable response.",
  );
}

function parseBrowseComps(
  payload: unknown,
  input: { grade: number | null; grader: string },
): ActiveListingComp[] {
  const root = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const summaries = Array.isArray(root.itemSummaries) ? root.itemSummaries : [];
  const comps: ActiveListingComp[] = [];

  for (const item of summaries) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const price = parseListingPrice(record);
    if (price == null) continue;

    const title = typeof record.title === "string" ? record.title : "";
    const gradeMatched = listingMatchesGrade(title, input.grade, input.grader);
    comps.push({ price, gradeMatched });
  }

  const gradeMatched = comps.filter((comp) => comp.gradeMatched);
  return gradeMatched.length > 0 ? gradeMatched : comps;
}

async function searchBrowseComps(
  accessToken: string,
  browseEnv: EbayEnv,
  query: string,
  categoryId: string,
  input: { grade: number | null; grader: string },
): Promise<ActiveListingComp[]> {
  const url = new URL(`${browseBaseUrl(browseEnv)}/item_summary/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("category_ids", categoryId);
  url.searchParams.set("limit", "50");

  const payload = await browseRequest(url.toString(), accessToken);
  const comps = parseBrowseComps(payload, input);
  if (comps.length > 0) return comps;

  // Retry without category filter — some listings are miscategorized.
  url.searchParams.delete("category_ids");
  const broadPayload = await browseRequest(url.toString(), accessToken);
  return parseBrowseComps(broadPayload, input);
}

export async function fetchEbayActiveListings(input: {
  title: string | null;
  issue: string | null;
  grade: number | null;
  grader: string;
  clientId?: string | null;
  clientSecret?: string | null;
  env?: string | null;
  browseClientId?: string | null;
  browseClientSecret?: string | null;
  browseEnv?: string | null;
  categoryId?: string;
}): Promise<ActiveListingComp[]> {
  const creds = resolveEbayBrowseCredentials({
    oauthClientId: input.clientId,
    oauthClientSecret: input.clientSecret,
    oauthEnv: input.env,
    browseClientId: input.browseClientId,
    browseClientSecret: input.browseClientSecret,
    browseEnv: input.browseEnv ?? Deno.env.get("EBAY_BROWSE_ENV"),
  });

  if (!creds) {
    throw new EbayBrowseError(
      "ebay_not_configured",
      "EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are required for Browse API comps.",
      503,
    );
  }

  parseEbayOAuthConfig({ clientId: creds.clientId, env: creds.env });

  const queries = buildSearchQueries(input);
  if (queries.length === 0) return [];

  const accessToken = await getApplicationAccessToken(
    creds.env,
    creds.clientId,
    creds.clientSecret,
  );

  const categoryId = input.categoryId ?? DEFAULT_CATEGORY_ID;

  for (const query of queries) {
    const comps = await searchBrowseComps(
      accessToken,
      creds.env,
      query,
      categoryId,
      input,
    );
    if (comps.length > 0) return comps;
  }

  return [];
}
