/**
 * GoCollect REST client (PRD §5.3, §9).
 *
 * Documented endpoints (https://gocollect.com/api-docs):
 *   GET /v1/collectibles          — search collectibles
 *   GET /v1/insights/item/:id     — grade-specific insights + sales
 *
 * Response shapes vary by API tier; parsers accept several common layouts.
 */

import type { SaleComp } from "./pricing-stats.ts";
import { userFacingApiError } from "./api-errors.ts";
import { fetchWithTimeout } from "./fetch.ts";

const GOCOLLECT_BASE = "https://api.gocollect.com/v1";
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const BACKOFF_MS = [800, 2_000];

export class GoCollectError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = "GoCollectError";
  }
}

export type GoCollectCollectible = {
  id: string;
  title: string | null;
  issue: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[$,]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function normalizeIssue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^#+/, "");
  return trimmed || null;
}

function issuesMatch(expected: string | null, candidate: string | null): boolean {
  if (!expected) return true;
  if (!candidate) return false;
  const a = normalizeIssue(expected);
  const b = normalizeIssue(candidate);
  if (!a || !b) return false;
  return a === b || a.replace(/^0+/, "") === b.replace(/^0+/, "");
}

function titlesMatch(expected: string | null, candidate: string | null): boolean {
  if (!expected || !candidate) return false;
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const a = normalize(expected);
  const b = normalize(candidate);
  return b.includes(a) || a.includes(b);
}

function formatGrade(grade: number | null): string | null {
  if (grade == null || !Number.isFinite(grade)) return null;
  return Number(grade).toFixed(1).replace(/\.0$/, "");
}

function graderLabel(grader: string): string {
  return grader.toUpperCase() === "CBCS" ? "cbcs" : "cgc";
}

function parseSaleDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

function extractCollectibles(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  if (!root) return [];

  const candidates = [
    ...asArray(root.data),
    ...asArray(root.items),
    ...asArray(root.results),
    ...asArray(root.collectibles),
  ];

  if (candidates.length === 0 && Array.isArray(payload)) {
    return payload.filter((item) => asRecord(item)) as Record<string, unknown>[];
  }

  return candidates
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);
}

function extractSales(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  if (!root) return [];

  const candidates = [
    ...asArray(root.data),
    ...asArray(root.sales),
    ...asArray(root.results),
    ...asArray(root.records),
    ...asArray(root.history),
  ];

  const nested = asRecord(root.insights) ?? asRecord(root.item);
  if (nested) {
    candidates.push(
      ...asArray(nested.sales),
      ...asArray(nested.data),
      ...asArray(nested.records),
    );
  }

  return candidates
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);
}

async function gocollectRequest(
  apiKey: string,
  path: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(`${GOCOLLECT_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        url.toString(),
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        },
        REQUEST_TIMEOUT_MS,
      );
    } catch (err) {
      const timedOut = err instanceof Error &&
        /timed out/i.test(err.message);
      if (timedOut && attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt] ?? 2_000);
        continue;
      }
      throw new GoCollectError(
        "gocollect_unreachable",
        timedOut
          ? "GoCollect is temporarily unavailable. Try again later."
          : userFacingApiError(err, "GoCollect request failed."),
        502,
      );
    }

    if (response.status === 429 || response.status === 503 || response.status === 522 || response.status === 524) {
      if (attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt] ?? 5_000);
        continue;
      }
      throw new GoCollectError(
        "rate_limited",
        "GoCollect is temporarily unavailable. Try again later.",
        429,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new GoCollectError(
        "gocollect_auth_failed",
        "GoCollect API key is invalid or lacks access.",
        response.status,
      );
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new GoCollectError(
        "gocollect_api_error",
        userFacingApiError(new Error(detail), `GoCollect request failed (${response.status}).`),
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

  throw new GoCollectError(
    "gocollect_api_error",
    lastError?.message ?? "GoCollect returned an unreadable response.",
  );
}

export async function searchCollectible(
  apiKey: string,
  input: { title: string | null; issue: string | null },
): Promise<GoCollectCollectible | null> {
  if (!input.title?.trim()) return null;

  const query = [input.title.trim(), input.issue?.trim()]
    .filter(Boolean)
    .join(" ");

  const payload = await gocollectRequest(apiKey, "/collectibles", {
    search: query,
    query,
    market: "comics",
    type: "comics",
    limit: "25",
  });

  const items = extractCollectibles(payload);
  if (items.length === 0) return null;

  const ranked = items
    .map((item) => {
      const id = pickString(item, ["id", "item_id", "itemId", "collectible_id"]);
      const title = pickString(item, ["title", "name", "series_title", "seriesTitle"]);
      const issue = pickString(item, [
        "issue",
        "issue_number",
        "issueNumber",
        "number",
      ]);
      if (!id) return null;

      let score = 0;
      if (titlesMatch(input.title, title)) score += 2;
      if (issuesMatch(input.issue, issue)) score += 3;

      return { id, title, issue, score };
    })
    .filter((item): item is GoCollectCollectible & { score: number } =>
      item !== null
    )
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score === 0) return null;

  return {
    id: best.id,
    title: best.title,
    issue: best.issue,
  };
}

function parseSaleRecord(
  record: Record<string, unknown>,
  targetGrade: string | null,
): SaleComp | null {
  const price = pickNumber(record, [
    "price",
    "sale_price",
    "salePrice",
    "amount",
    "sold_price",
    "soldPrice",
  ]);
  if (price == null || price <= 0) return null;

  const saleDate = parseSaleDate(
    pickString(record, [
      "sale_date",
      "saleDate",
      "date",
      "sold_at",
      "soldAt",
      "transaction_date",
    ]),
  );
  if (!saleDate) return null;

  const saleGrade = pickString(record, ["grade", "numeric_grade", "numericGrade"]);
  const gradeMatched = targetGrade
    ? saleGrade === targetGrade ||
      saleGrade?.replace(/\.0$/, "") === targetGrade.replace(/\.0$/, "")
    : true;

  return { price, saleDate, gradeMatched };
}

export async function fetchGoCollectSales(
  apiKey: string,
  input: {
    itemId: string;
    grade: number | null;
    grader: string;
    days?: number;
  },
): Promise<SaleComp[]> {
  const grade = formatGrade(input.grade);
  const label = graderLabel(input.grader);
  const days = String(input.days ?? 90);

  const paths = [
    `/collectibles/${input.itemId}/sales`,
    `/insights/item/${input.itemId}/sales`,
  ];

  let lastPayload: unknown = null;

  for (const path of paths) {
    try {
      lastPayload = await gocollectRequest(apiKey, path, {
        grade: grade ?? "",
        label,
        grader: input.grader.toUpperCase(),
        days,
        limit: "250",
      });
      const sales = extractSales(lastPayload)
        .map((record) => parseSaleRecord(record, grade))
        .filter((sale): sale is SaleComp => sale !== null);
      if (sales.length > 0) return sales;
    } catch (err) {
      if (err instanceof GoCollectError && err.code === "gocollect_api_error") {
        continue;
      }
      throw err;
    }
  }

  // Insights endpoint may embed sales or summary stats.
  const insightsPayload = await gocollectRequest(
    apiKey,
    `/insights/item/${input.itemId}`,
    {
      grade: grade ?? "",
      label,
      grader: input.grader.toUpperCase(),
      days,
    },
  );

  const insightSales = extractSales(insightsPayload)
    .map((record) => parseSaleRecord(record, grade))
    .filter((sale): sale is SaleComp => sale !== null);

  if (insightSales.length > 0) return insightSales;

  return [];
}

export async function fetchGoCollectComps(
  apiKey: string,
  input: {
    title: string | null;
    issue: string | null;
    grade: number | null;
    grader: string;
  },
): Promise<{ item: GoCollectCollectible | null; sales: SaleComp[] }> {
  const item = await searchCollectible(apiKey, {
    title: input.title,
    issue: input.issue,
  });

  if (!item) {
    return { item: null, sales: [] };
  }

  const sales = await fetchGoCollectSales(apiKey, {
    itemId: item.id,
    grade: input.grade,
    grader: input.grader,
    days: 90,
  });

  return { item, sales };
}
