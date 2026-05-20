/**
 * cert-lookup — CGC/CBCS certification enrichment (PRD §7.2)
 *
 * PERSONAL-USE SCRAPING NOTICE
 * ---------------------------
 * CGC and CBCS do not offer a public cert API for hobbyist apps. This function
 * fetches their public verify pages and parses HTML with deno-dom. That is a
 * ToS gray area (see PRD §9). Use only for personal/household inventory, keep
 * requests conservative (30/min per user), and always offer manual entry in
 * the mobile app when lookup fails.
 *
 * CGC often serves Cloudflare challenges to datacenter IPs; if lookups fail in
 * production, update selectors below or switch to an approved data source.
 *
 * HTML SELECTOR MAINTENANCE (update when sites change)
 * ----------------------------------------------------
 * CGC (https://www.cgccomics.com/certlookup/<cert>/)
 *   - Primary label/value rows: table.certlookup-details tr, .itemData tr
 *   - Title: h1.cert-title, .item-title, #itemName, meta[property="og:title"]
 *   - Not found copy: text matching /not found|no grade|invalid cert/i
 *
 * CBCS (https://www.cbcscomics.com/certlookup/<cert>/)
 *   - Label/value: .cert-details tr, table.table tr, dl dt/dd
 *   - Title: h1, .book-title, .cert-title
 *   - Note: CBCS verify is an Angular SPA; HTML may be a shell without data.
 *     If only ng-app shell is returned, clients get error scrape_unavailable.
 *
 * Deploy:  supabase functions deploy cert-lookup
 * Test:    see README in this folder or comment at bottom of file.
 */

import { DOMParser, type Document } from "deno_dom";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Grader = "CGC" | "CBCS";

type CertLookupRequest = {
  grader?: Grader;
  certNumber?: string;
};

export type CertLookupResult = {
  grader: Grader;
  certNumber: string;
  title: string | null;
  issue: string | null;
  variant: string | null;
  year: number | null;
  grade: string | null;
  encapsulationDate: string | null;
  keyNotes: string[];
};

const LABEL_MAP: Record<string, keyof Omit<CertLookupResult, "grader" | "certNumber" | "keyNotes">> = {
  title: "title",
  "comic title": "title",
  "book title": "title",
  issue: "issue",
  "issue number": "issue",
  "#": "issue",
  variant: "variant",
  "variant name": "variant",
  year: "year",
  "publication year": "year",
  grade: "grade",
  "numeric grade": "grade",
  "final grade": "grade",
  "encapsulation date": "encapsulationDate",
  "date graded": "encapsulationDate",
  "grade date": "encapsulationDate",
  "graded date": "encapsulationDate",
};

const KEY_NOTE_LABELS = [
  "key notes",
  "grader notes",
  "art comments",
  "key comments",
  "comments",
  "note",
  "notes",
];

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function normalizeLabel(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/:$/, "");
}

function parseYear(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function parseDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Date(parsed).toISOString().slice(0, 10);
}

function emptyResult(grader: Grader, certNumber: string): CertLookupResult {
  return {
    grader,
    certNumber,
    title: null,
    issue: null,
    variant: null,
    year: null,
    grade: null,
    encapsulationDate: null,
    keyNotes: [],
  };
}

function applyLabelValue(
  result: CertLookupResult,
  label: string,
  value: string,
): void {
  const normalized = normalizeLabel(label);
  const mapped = LABEL_MAP[normalized];
  if (mapped && mapped !== "keyNotes") {
    const current = result[mapped];
    if (current === null || current === undefined || current === "") {
      if (mapped === "year") {
        result.year = parseYear(value);
      } else if (mapped === "encapsulationDate") {
        result.encapsulationDate = parseDate(value);
      } else {
        (result[mapped] as string | null) = value.trim() || null;
      }
    }
    return;
  }
  if (KEY_NOTE_LABELS.some((k) => normalized.includes(k))) {
    const notes = value
      .split(/\n|;|\|/)
      .map((n) => n.trim())
      .filter(Boolean);
    result.keyNotes.push(...notes);
  }
}

function extractFromTables(doc: Document, result: CertLookupResult): void {
  const rows = doc.querySelectorAll("table tr");
  for (const row of rows) {
    const cells = row.querySelectorAll("th, td");
    if (cells.length < 2) continue;
    const label = cells[0]?.textContent ?? "";
    const value = cells[1]?.textContent ?? "";
    if (label && value) applyLabelValue(result, label, value);
  }
}

function extractFromDefinitionLists(doc: Document, result: CertLookupResult): void {
  const terms = doc.querySelectorAll("dt");
  for (const term of terms) {
    const label = term.textContent ?? "";
    const dd = term.nextElementSibling;
    const value = dd?.textContent ?? "";
    if (label && value) applyLabelValue(result, label, value);
  }
}

function extractFromLabelSpans(doc: Document, result: CertLookupResult): void {
  const labels = doc.querySelectorAll(
    ".label, .field-label, .cert-label, [class*='label']",
  );
  for (const labelEl of labels) {
    const label = labelEl.textContent ?? "";
    const sibling = labelEl.nextElementSibling;
    const value =
      sibling?.textContent ??
      labelEl.parentElement?.querySelector(".value, .field-value")
        ?.textContent ??
      "";
    if (label && value) applyLabelValue(result, label, value);
  }
}

function extractTitleFallback(doc: Document, result: CertLookupResult): void {
  if (result.title) return;

  const selectors = [
    "h1.cert-title",
    "h1.item-title",
    "#itemName",
    ".item-title",
    ".book-title",
    ".cert-title",
    "h1",
  ];
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const text = el?.textContent?.trim();
    if (text && text.length > 2 && !/certification|lookup|cbcs|cgc/i.test(text)) {
      result.title = text;
      break;
    }
  }

  const ogTitle = doc.querySelector('meta[property="og:title"]')
    ?.getAttribute("content");
  if (!result.title && ogTitle && !/cbcs|cgc|grading/i.test(ogTitle)) {
    result.title = ogTitle.trim();
  }
}

function extractJsonLd(doc: Document, result: CertLookupResult): void {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    const raw = script.textContent?.trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      if (typeof data.name === "string" && !result.title) {
        result.title = data.name;
      }
      if (typeof data.description === "string") {
        const desc = data.description;
        if (!result.grade) {
          const gradeMatch = desc.match(/\b\d+(\.\d+)?\b/);
          if (gradeMatch) result.grade = gradeMatch[0];
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }
}

function parseCertHtml(
  html: string,
  grader: Grader,
  certNumber: string,
): CertLookupResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const result = emptyResult(grader, certNumber);
  if (!doc) return result;

  extractFromTables(doc, result);
  extractFromDefinitionLists(doc, result);
  extractFromLabelSpans(doc, result);
  extractJsonLd(doc, result);
  extractTitleFallback(doc, result);

  result.keyNotes = [...new Set(result.keyNotes)];
  return result;
}

function isCloudflareChallenge(html: string): boolean {
  return (
    html.includes("Just a moment") ||
    html.includes("cf-challenge") ||
    html.includes("challenge-platform")
  );
}

function isCbcsSpaShell(html: string): boolean {
  return html.includes('ng-app="cbcs.public"') &&
    !html.includes("cert-lookup") &&
    !html.match(/grade|encapsulation|issue/i);
}

function isNotFoundHtml(html: string): boolean {
  return /cert(ification)?\s*(number\s*)?(was\s*)?not\s*found|no\s*record\s*found|invalid\s*cert|unable\s*to\s*locate|does\s*not\s*exist/i
    .test(html);
}

function hasMeaningfulData(result: CertLookupResult): boolean {
  return Boolean(
    result.title ||
      result.issue ||
      result.grade ||
      result.year ||
      result.encapsulationDate ||
      result.keyNotes.length > 0,
  );
}

const BROWSER_HEADERS: Record<string, string> = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
};

async function fetchVerifyHtml(url: string, referer?: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      ...(referer ? { Referer: referer } : {}),
    },
    redirect: "follow",
  });
  return await response.text();
}

function cgcVerifyUrl(certNumber: string): string {
  return `https://www.cgccomics.com/certlookup/${encodeURIComponent(certNumber)}/`;
}

function cbcsVerifyUrl(certNumber: string): string {
  return `https://www.cbcscomics.com/certlookup/${encodeURIComponent(certNumber)}/`;
}

async function lookupCgc(certNumber: string): Promise<CertLookupResult> {
  const pageUrl = cgcVerifyUrl(certNumber);
  const html = await fetchVerifyHtml(
    pageUrl,
    "https://www.cgccomics.com/certlookup/",
  );

  if (isCloudflareChallenge(html)) {
    throw new ScrapeError(
      "scrape_blocked",
      "CGC verify is blocking automated requests (Cloudflare). Use manual entry or retry later.",
      503,
    );
  }
  if (isNotFoundHtml(html)) {
    throw new ScrapeError(
      "not_found",
      `No CGC certification found for cert number ${certNumber}.`,
      404,
    );
  }

  const result = parseCertHtml(html, "CGC", certNumber);
  if (!hasMeaningfulData(result)) {
    throw new ScrapeError(
      "not_found",
      `Could not parse CGC cert data for ${certNumber}. The page layout may have changed.`,
      404,
    );
  }
  return result;
}

async function lookupCbcs(certNumber: string): Promise<CertLookupResult> {
  const html = await fetchVerifyHtml(cbcsVerifyUrl(certNumber));

  if (isCbcsSpaShell(html)) {
    throw new ScrapeError(
      "scrape_unavailable",
      "CBCS verify page is a client-side app; HTML scraping returned no cert data. Use manual entry.",
      503,
    );
  }
  if (isNotFoundHtml(html)) {
    throw new ScrapeError(
      "not_found",
      `No CBCS certification found for cert number ${certNumber}.`,
      404,
    );
  }

  const result = parseCertHtml(html, "CBCS", certNumber);
  if (!hasMeaningfulData(result)) {
    throw new ScrapeError(
      "not_found",
      `Could not parse CBCS cert data for ${certNumber}.`,
      404,
    );
  }
  return result;
}

class ScrapeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function checkRateLimit(
  admin: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const now = new Date();
  const { data, error } = await admin
    .from("cert_lookup_rate_limits")
    .select("window_start, request_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("rate limit read failed", error);
    return true;
  }

  if (!data) {
    const { error: insertError } = await admin.from("cert_lookup_rate_limits")
      .insert({
        user_id: userId,
        window_start: now.toISOString(),
        request_count: 1,
      });
    if (insertError) console.error("rate limit insert failed", insertError);
    return true;
  }

  const windowStart = new Date(data.window_start);
  const elapsed = now.getTime() - windowStart.getTime();

  if (elapsed > RATE_WINDOW_MS) {
    await admin.from("cert_lookup_rate_limits").update({
      window_start: now.toISOString(),
      request_count: 1,
    }).eq("user_id", userId);
    return true;
  }

  if (data.request_count >= RATE_LIMIT) {
    return false;
  }

  await admin.from("cert_lookup_rate_limits").update({
    request_count: data.request_count + 1,
  }).eq("user_id", userId);
  return true;
}

function validateRequest(body: CertLookupRequest): { grader: Grader; certNumber: string } {
  const grader = body.grader;
  const certNumber = body.certNumber?.trim();

  if (grader !== "CGC" && grader !== "CBCS") {
    throw new Error("grader must be CGC or CBCS");
  }
  if (!certNumber || !/^[A-Za-z0-9-]+$/.test(certNumber)) {
    throw new Error("certNumber is required (alphanumeric and hyphens only)");
  }
  return { grader, certNumber };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed", message: "Use POST" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(
      { error: "unauthorized", message: "Missing or invalid Authorization header" },
      401,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(
      { error: "server_error", message: "Supabase environment is not configured" },
      500,
    );
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return jsonResponse(
      { error: "unauthorized", message: "Invalid or expired session" },
      401,
    );
  }

  const allowed = await checkRateLimit(supabaseAdmin, user.id);
  if (!allowed) {
    return jsonResponse(
      {
        error: "rate_limited",
        message: `Rate limit exceeded (${RATE_LIMIT} requests per minute). Try again shortly.`,
      },
      429,
    );
  }

  let body: CertLookupRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "bad_request", message: "Invalid JSON body" }, 400);
  }

  let grader: Grader;
  let certNumber: string;
  try {
    ({ grader, certNumber } = validateRequest(body));
  } catch (err) {
    return jsonResponse({
      error: "bad_request",
      message: err instanceof Error ? err.message : "Invalid request",
    }, 400);
  }

  try {
    const result = grader === "CGC"
      ? await lookupCgc(certNumber)
      : await lookupCbcs(certNumber);
    return jsonResponse(result);
  } catch (err) {
    if (err instanceof ScrapeError) {
      return jsonResponse({ error: err.code, message: err.message }, err.status);
    }
    console.error("cert-lookup failed", err);
    return jsonResponse(
      { error: "server_error", message: "Cert lookup failed unexpectedly" },
      500,
    );
  }
});
