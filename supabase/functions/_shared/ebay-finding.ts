/**
 * eBay Finding API — sold comps via findCompletedItems (PRD §5.3).
 *
 * Uses SECURITY-APPNAME (App ID / Client ID) only — no OAuth.
 * Note: eBay retired this endpoint for new apps in 2024; may return no data.
 */

import { fetchWithTimeout } from "./fetch.ts";

const FINDING_BASE = "https://svcs.ebay.com/services/search/FindingService/v1";
const REQUEST_TIMEOUT_MS = 8_000;
/** Books & Magazines (Comics) per spec; Browse uses 259104 (Collectible Comic Books). */
const FINDING_CATEGORY_ID = "33";

export type EbayFindingComicInput = {
  title: string | null;
  issue: string | null;
  grade: number | null;
  grader: string;
};

export type EbayFindingComp = {
  price: number;
  saleDate: Date;
  gradeMatched: boolean;
  parsedGrade: number | null;
  title: string;
  url: string | null;
};

export type EbayFindingSummary = {
  exactMatches: number;
  nearbyMatches: number;
  avg90: number | null;
  median90: number | null;
};

export type EbayFindingResult = {
  comps: EbayFindingComp[];
  summary: EbayFindingSummary;
};

export class EbayFindingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = "EbayFindingError";
  }
}

const GRADE_REGEX = /(CGC|CBCS|CGSS|PGX)\s*(\d{1,2}(?:\.\d)?)/i;

function formatGrade(grade: number | null): string | null {
  if (grade == null || !Number.isFinite(grade)) return null;
  return Number(grade).toFixed(1);
}

function graderToken(grader: string): string {
  const upper = grader.trim().toUpperCase();
  if (upper === "CBCS") return "CBCS";
  return "CGC";
}

function buildSearchQueries(input: EbayFindingComicInput): string[] {
  if (!input.title?.trim()) return [];

  const title = input.title.trim();
  const issuePart = input.issue?.trim() ? ` #${input.issue.trim()}` : "";
  const base = `${title}${issuePart}`;
  const grader = graderToken(input.grader);
  const gradeText = formatGrade(input.grade);

  const queries: string[] = [];
  if (gradeText) {
    queries.push(`${base} ${grader} ${gradeText}`);
  }
  queries.push(`${base} ${grader}`);
  return [...new Set(queries)];
}

function parseGradeFromTitle(
  title: string,
  comicGrade: number | null,
): { parsedGrade: number | null; gradeMatched: boolean } {
  const match = title.match(GRADE_REGEX);
  if (!match) {
    return { parsedGrade: null, gradeMatched: false };
  }

  const parsedGrade = Number(match[2]);
  if (!Number.isFinite(parsedGrade)) {
    return { parsedGrade: null, gradeMatched: false };
  }

  const gradeMatched = comicGrade != null &&
    Math.abs(parsedGrade - comicGrade) < 0.01;
  return { parsedGrade, gradeMatched };
}

function firstString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const obj = first as Record<string, unknown>;
      if (typeof obj.__value__ === "string") return obj.__value__;
      if (typeof obj.value === "string") return obj.value;
      if (typeof obj["#text"] === "string") return obj["#text"];
    }
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.__value__ === "string") return obj.__value__;
    if (typeof obj.value === "string") return obj.value;
  }
  return null;
}

function firstNumber(value: unknown): number | null {
  const str = firstString(value);
  if (str == null) return null;
  const parsed = Number(String(str).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nestedFirst(obj: unknown, ...keys: string[]): unknown {
  let current: unknown = obj;
  for (const key of keys) {
    if (!current || typeof current !== "object") return null;
    const record = current as Record<string, unknown>;
    current = record[key];
    if (Array.isArray(current) && current.length > 0) {
      current = current[0];
    }
  }
  return current;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function iso90DaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString();
}

function buildFindingUrl(keywords: string, ebayAppId: string): string {
  const url = new URL(FINDING_BASE);
  url.searchParams.set("OPERATION-NAME", "findCompletedItems");
  url.searchParams.set("SERVICE-VERSION", "1.0.0");
  url.searchParams.set("SECURITY-APPNAME", ebayAppId);
  url.searchParams.set("RESPONSE-DATA-FORMAT", "JSON");
  url.searchParams.set("keywords", keywords);
  url.searchParams.set("categoryId", FINDING_CATEGORY_ID);
  url.searchParams.set("itemFilter(0).name", "SoldItemsOnly");
  url.searchParams.set("itemFilter(0).value", "true");
  url.searchParams.set("itemFilter(1).name", "EndTimeFrom");
  url.searchParams.set("itemFilter(1).value", iso90DaysAgo());
  url.searchParams.set("sortOrder", "EndTimeSoonest");
  url.searchParams.set("paginationInput.entriesPerPage", "50");
  return url.toString();
}

function parseFindingItems(
  payload: unknown,
  comic: EbayFindingComicInput,
): EbayFindingComp[] {
  const root = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const response = nestedFirst(root, "findCompletedItemsResponse");
  const searchResult = nestedFirst(response, "searchResult");
  const itemsRaw = nestedFirst(searchResult, "item");

  const items = Array.isArray(itemsRaw)
    ? itemsRaw
    : itemsRaw
    ? [itemsRaw]
    : [];

  const comps: EbayFindingComp[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;

    const title = firstString(record.title) ?? "";
    const price = firstNumber(
      nestedFirst(record, "sellingStatus", "convertedCurrentPrice") ??
        nestedFirst(record, "sellingStatus", "currentPrice"),
    );
    const endTime = firstString(nestedFirst(record, "listingInfo", "endTime"));
    const url = firstString(record.viewItemURL);

    if (price == null || !endTime) continue;

    const saleDate = new Date(endTime);
    if (Number.isNaN(saleDate.getTime())) continue;

    const { parsedGrade, gradeMatched } = parseGradeFromTitle(
      title,
      comic.grade,
    );

    const dedupeKey = `${title}|${price}|${saleDate.toISOString()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    comps.push({
      price,
      saleDate,
      gradeMatched,
      parsedGrade,
      title,
      url,
    });
  }

  return comps;
}

function computeSummary(comps: EbayFindingComp[]): EbayFindingSummary {
  const exactMatches = comps.filter((c) => c.gradeMatched).length;
  const nearbyMatches = comps.length - exactMatches;
  const prices = comps.map((c) => c.price);
  const avg90 = prices.length > 0
    ? prices.reduce((a, b) => a + b, 0) / prices.length
    : null;
  const median90 = median(prices);

  return { exactMatches, nearbyMatches, avg90, median90 };
}

async function searchFindingOnce(
  keywords: string,
  ebayAppId: string,
  comic: EbayFindingComicInput,
): Promise<EbayFindingComp[]> {
  const url = buildFindingUrl(keywords, ebayAppId);
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    }, REQUEST_TIMEOUT_MS);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new EbayFindingError(
      "ebay_finding_network",
      `eBay Finding API request failed: ${message}`,
      502,
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new EbayFindingError(
      "ebay_finding_api_error",
      `eBay Finding API failed (${response.status}): ${text.slice(0, 300)}`,
      response.status >= 500 ? 502 : response.status,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new EbayFindingError(
      "ebay_finding_parse_error",
      "eBay Finding API returned invalid JSON.",
    );
  }

  const ack = firstString(
    nestedFirst(payload, "findCompletedItemsResponse", "ack"),
  );
  if (ack && ack.toLowerCase() === "failure") {
    const message = firstString(
      nestedFirst(
        payload,
        "findCompletedItemsResponse",
        "errorMessage",
        "error",
        "message",
      ),
    ) ?? "eBay Finding API returned failure.";
    throw new EbayFindingError("ebay_finding_failure", message);
  }

  return parseFindingItems(payload, comic);
}

export async function fetchEbayFindingCompletedItems(input: {
  comic: EbayFindingComicInput;
  ebayAppId: string;
}): Promise<EbayFindingResult> {
  const ebayAppId = input.ebayAppId.trim();
  if (!ebayAppId) {
    throw new EbayFindingError(
      "ebay_not_configured",
      "EBAY_APP_ID (or EBAY_CLIENT_ID) is required for eBay sold comps.",
      503,
    );
  }

  const queries = buildSearchQueries(input.comic);
  if (queries.length === 0) {
    return {
      comps: [],
      summary: { exactMatches: 0, nearbyMatches: 0, avg90: null, median90: null },
    };
  }

  // The eBay Finding API was retired for new apps in 2024; almost always returns
  // 0 results. Run only the most specific query to keep latency low.
  const query = queries[0];
  const comps = await searchFindingOnce(query, ebayAppId, input.comic);
  return { comps, summary: computeSummary(comps) };
}
