/**
 * pricing-refresh — GoCollect sold + eBay sold (Finding) + eBay Browse active (PRD §5.3).
 *
 * POST { comicId }           — authenticated; RLS scopes comic access
 * POST { scheduled: true }   — weekly cron (service role JWT)
 *
 * Secrets:
 *   GOCOLLECT_API_KEY          — sold comps (optional if eBay configured)
 *   EBAY_APP_ID                — Finding API App ID (falls back to EBAY_CLIENT_ID)
 *   EBAY_CLIENT_ID / SECRET    — Browse API application token
 *   EBAY_OAUTH_ENV             — production | sandbox
 *
 * Deploy:
 *   supabase functions deploy pricing-refresh
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import { CORS_HEADERS, jsonResponse } from "../_shared/cors.ts";
import { userFacingApiError } from "../_shared/api-errors.ts";
import {
  fetchEbayActiveListings,
  EbayBrowseError,
  type ActiveListingComp,
} from "../_shared/ebay-browse.ts";
import {
  EbayFindingError,
  fetchEbayFindingCompletedItems,
  type EbayFindingComp,
} from "../_shared/ebay-finding.ts";
import {
  fetchGoCollectComps,
  GoCollectError,
} from "../_shared/gocollect.ts";
import {
  computePriceBands,
  computeSnapshotBands,
  emptyPriceBands,
  type PriceBands,
  type SaleComp,
} from "../_shared/pricing-stats.ts";

type PricingRefreshRequest = {
  comicId?: string;
  scheduled?: boolean;
};

type ComicRow = {
  id: string;
  org_id: string;
  title: string | null;
  issue: string | null;
  grade: number | null;
  grader: string;
  status: string;
};

export type SourceStatus =
  | "ok"
  | "no_data"
  | "not_configured"
  | "error";

export type SourceDiagnostic = {
  status: SourceStatus;
  count: number;
  message?: string;
};

type SourceBands = PriceBands & {
  source: "gocollect" | "ebay";
  compsStored: number;
  gocollectItemId?: string | null;
  breakdown?: { gocollect: number; ebay: number };
  message?: string;
  diagnostics?: {
    gocollect?: SourceDiagnostic;
    ebaySold?: SourceDiagnostic;
    ebayActive?: SourceDiagnostic;
  };
};

type RefreshResult = {
  comicId: string;
  fetchedAt: string;
  sold: SourceBands;
  active: SourceBands;
};

const SCHEDULED_DELAY_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isServiceRoleRequest(
  authHeader: string | null,
  serviceRoleKey: string,
): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  return authHeader.slice("Bearer ".length) === serviceRoleKey;
}

function buildSoldEmptyMessage(
  gocollect: SourceDiagnostic,
  ebaySold: SourceDiagnostic,
): string {
  const parts: string[] = [];
  if (gocollect.status === "not_configured") {
    parts.push("GoCollect not configured");
  } else if (gocollect.status === "error" && gocollect.message) {
    parts.push(`GoCollect: ${gocollect.message}`);
  } else if (gocollect.status === "no_data") {
    parts.push("GoCollect: 0 sales");
  }
  if (ebaySold.status === "not_configured") {
    parts.push("eBay Finding not configured");
  } else if (ebaySold.status === "error" && ebaySold.message) {
    parts.push(`eBay Finding: ${ebaySold.message}`);
  } else if (ebaySold.status === "no_data") {
    parts.push("eBay Finding: 0 sales");
  }
  if (parts.length === 0) {
    return "No sold comps for this title, issue, and grade in the last 90 days.";
  }
  return `No matching sold comps in the last 90 days (${parts.join(" · ")}).`;
}

function soldBandsPayload(
  sales: SaleComp[],
  compsStored: number,
  gocollectItemId: string | null,
  breakdown: { gocollect: number; ebay: number },
  diagnostics: { gocollect: SourceDiagnostic; ebaySold: SourceDiagnostic },
): SourceBands {
  const bands = sales.length > 0 ? computePriceBands(sales) : emptyPriceBands();
  return {
    source: "gocollect",
    compsStored,
    gocollectItemId,
    breakdown,
    diagnostics,
    ...bands,
    ...(sales.length === 0
      ? {
        message: buildSoldEmptyMessage(
          diagnostics.gocollect,
          diagnostics.ebaySold,
        ),
      }
      : {}),
  };
}

function activeBandsPayload(
  listings: ActiveListingComp[],
  compsStored: number,
  browseEnv: string | null,
  diagnostic: SourceDiagnostic,
): SourceBands {
  const prices = listings.map((listing) => listing.price);
  const bands = prices.length > 0
    ? computeSnapshotBands(prices)
    : emptyPriceBands();

  let emptyMessage =
    "No matching eBay active listings for this title, issue, and grade.";
  if (diagnostic.status === "not_configured") {
    emptyMessage = "eBay Browse API is not configured.";
  } else if (diagnostic.status === "error" && diagnostic.message) {
    emptyMessage = `eBay Browse: ${diagnostic.message}`;
  } else if (prices.length === 0 && browseEnv === "sandbox") {
    emptyMessage =
      "eBay sandbox has almost no active listings. Add production EBAY_BROWSE_CLIENT_ID/SECRET secrets for real comps.";
  }

  return {
    source: "ebay",
    compsStored,
    diagnostics: { ebayActive: diagnostic },
    ...bands,
    ...(prices.length === 0 ? { message: emptyMessage } : {}),
  };
}

async function persistSoldComps(
  client: SupabaseClient,
  comic: ComicRow,
  sales: SaleComp[],
  fetchedAt: string,
): Promise<number> {
  const { error: deleteError } = await client
    .from("price_history")
    .delete()
    .eq("comic_id", comic.id)
    .eq("source", "gocollect");

  if (deleteError) {
    throw new Error(`Could not clear prior GoCollect comps: ${deleteError.message}`);
  }

  if (sales.length === 0) return 0;

  const rows = sales.map((sale) => ({
    org_id: comic.org_id,
    comic_id: comic.id,
    source: "gocollect",
    price: sale.price,
    sale_date: sale.saleDate.toISOString().slice(0, 10),
    grade_matched: sale.gradeMatched,
    fetched_at: fetchedAt,
  }));

  const { error: insertError } = await client.from("price_history").insert(rows);
  if (insertError) {
    throw new Error(`Could not store GoCollect comps: ${insertError.message}`);
  }

  return rows.length;
}

async function persistEbaySoldComps(
  client: SupabaseClient,
  comic: ComicRow,
  comps: EbayFindingComp[],
  fetchedAt: string,
): Promise<number> {
  const { error: deleteError } = await client
    .from("price_history")
    .delete()
    .eq("comic_id", comic.id)
    .eq("source", "ebay_sold");

  if (deleteError) {
    throw new Error(`Could not clear prior eBay sold comps: ${deleteError.message}`);
  }

  if (comps.length === 0) return 0;

  const rows = comps.map((comp) => ({
    org_id: comic.org_id,
    comic_id: comic.id,
    source: "ebay_sold",
    price: comp.price,
    sale_date: comp.saleDate.toISOString().slice(0, 10),
    grade_matched: comp.gradeMatched,
    fetched_at: fetchedAt,
    metadata: {
      title: comp.title,
      url: comp.url,
      parsed_grade: comp.parsedGrade,
    },
  }));

  const { error: insertError } = await client.from("price_history").insert(rows);
  if (insertError) {
    throw new Error(`Could not store eBay sold comps: ${insertError.message}`);
  }

  return rows.length;
}

function findingCompsToSaleComps(comps: EbayFindingComp[]): SaleComp[] {
  return comps.map((comp) => ({
    price: comp.price,
    saleDate: comp.saleDate,
    gradeMatched: comp.gradeMatched,
  }));
}

async function persistActiveComps(
  client: SupabaseClient,
  comic: ComicRow,
  listings: ActiveListingComp[],
  fetchedAt: string,
): Promise<number> {
  const { error: deleteError } = await client
    .from("price_history")
    .delete()
    .eq("comic_id", comic.id)
    .eq("source", "ebay");

  if (deleteError) {
    throw new Error(`Could not clear prior eBay comps: ${deleteError.message}`);
  }

  if (listings.length === 0) return 0;

  const rows = listings.map((listing) => ({
    org_id: comic.org_id,
    comic_id: comic.id,
    source: "ebay",
    price: listing.price,
    sale_date: null,
    grade_matched: listing.gradeMatched,
    fetched_at: fetchedAt,
  }));

  const { error: insertError } = await client.from("price_history").insert(rows);
  if (insertError) {
    throw new Error(`Could not store eBay comps: ${insertError.message}`);
  }

  return rows.length;
}

async function refreshComicPricing(
  writeClient: SupabaseClient,
  comic: ComicRow,
  secrets: {
    gocollectApiKey: string | null;
    ebayAppId: string | null;
    ebayClientId: string | null;
    ebayClientSecret: string | null;
    ebayEnv: string | null;
    ebayBrowseClientId: string | null;
    ebayBrowseClientSecret: string | null;
    ebayBrowseEnv: string | null;
  },
): Promise<RefreshResult> {
  const fetchedAt = new Date().toISOString();

  const [gocollectOutcome, ebaySoldOutcome, activeOutcome] = await Promise.all([
    (async (): Promise<{
      gocollectItemId: string | null;
      sales: SaleComp[];
      error: string | null;
    }> => {
      if (!secrets.gocollectApiKey) {
        return {
          gocollectItemId: null,
          sales: [],
          error: "GoCollect API key is not configured.",
        };
      }

      try {
        const result = await fetchGoCollectComps(secrets.gocollectApiKey, {
          title: comic.title,
          issue: comic.issue,
          grade: comic.grade,
          grader: comic.grader,
        });
        return {
          gocollectItemId: result.item?.id ?? null,
          sales: result.sales,
          error: null,
        };
      } catch (err) {
        const message = err instanceof GoCollectError
          ? err.message
          : userFacingApiError(err, "GoCollect request failed.");
        console.error("pricing-refresh: gocollect failed", err);
        return { gocollectItemId: null, sales: [], error: message };
      }
    })(),
    (async (): Promise<{
      comps: EbayFindingComp[];
      error: string | null;
    }> => {
      if (!secrets.ebayAppId) {
        return { comps: [], error: null };
      }

      try {
        const result = await fetchEbayFindingCompletedItems({
          comic: {
            title: comic.title,
            issue: comic.issue,
            grade: comic.grade,
            grader: comic.grader,
          },
          ebayAppId: secrets.ebayAppId,
        });
        return { comps: result.comps, error: null };
      } catch (err) {
        const message = err instanceof EbayFindingError
          ? err.message
          : userFacingApiError(err, "eBay Finding request failed.");
        console.warn("pricing-refresh: ebay finding failed", err);
        return { comps: [], error: message };
      }
    })(),
    (async (): Promise<{
      listings: ActiveListingComp[];
      browseEnv: string | null;
      error: string | null;
    }> => {
      if (!secrets.ebayClientId || !secrets.ebayClientSecret) {
        return {
          listings: [],
          browseEnv: null,
          error: "eBay API credentials are not configured.",
        };
      }

      const browseEnv = secrets.ebayBrowseClientId && secrets.ebayBrowseClientSecret
        ? (secrets.ebayBrowseEnv ?? "production")
        : (secrets.ebayBrowseEnv ?? secrets.ebayEnv ?? "production");

      try {
        const listings = await fetchEbayActiveListings({
          title: comic.title,
          issue: comic.issue,
          grade: comic.grade,
          grader: comic.grader,
          clientId: secrets.ebayClientId,
          clientSecret: secrets.ebayClientSecret,
          env: secrets.ebayEnv,
          browseClientId: secrets.ebayBrowseClientId,
          browseClientSecret: secrets.ebayBrowseClientSecret,
          browseEnv: secrets.ebayBrowseEnv,
        });
        return { listings, browseEnv, error: null };
      } catch (err) {
        const message = err instanceof EbayBrowseError
          ? err.message
          : userFacingApiError(err, "eBay Browse request failed.");
        console.error("pricing-refresh: ebay browse failed", err);
        return { listings: [], browseEnv, error: message };
      }
    })(),
  ]);

  const { gocollectItemId, sales: gocollectSales, error: gocollectError } =
    gocollectOutcome;
  const { comps: ebaySoldComps, error: ebaySoldError } = ebaySoldOutcome;
  const { listings, browseEnv, error: activeError } = activeOutcome;

  const gocollectStored = gocollectError
    ? 0
    : await persistSoldComps(writeClient, comic, gocollectSales, fetchedAt);
  const ebaySoldStored = ebaySoldError
    ? 0
    : await persistEbaySoldComps(writeClient, comic, ebaySoldComps, fetchedAt);
  const activeStored = activeError
    ? 0
    : await persistActiveComps(writeClient, comic, listings, fetchedAt);

  const combinedSales: SaleComp[] = [
    ...(gocollectError ? [] : gocollectSales),
    ...(ebaySoldError ? [] : findingCompsToSaleComps(ebaySoldComps)),
  ];
  const breakdown = {
    gocollect: gocollectStored,
    ebay: ebaySoldStored,
  };

  const gocollectDiagnostic: SourceDiagnostic = !secrets.gocollectApiKey
    ? { status: "not_configured", count: 0 }
    : gocollectError
    ? { status: "error", count: 0, message: gocollectError }
    : gocollectStored === 0
    ? { status: "no_data", count: 0 }
    : { status: "ok", count: gocollectStored };

  const ebaySoldDiagnostic: SourceDiagnostic = !secrets.ebayAppId
    ? { status: "not_configured", count: 0 }
    : ebaySoldError
    ? { status: "error", count: 0, message: ebaySoldError }
    : ebaySoldStored === 0
    ? { status: "no_data", count: 0 }
    : { status: "ok", count: ebaySoldStored };

  const ebayActiveDiagnostic: SourceDiagnostic =
    !secrets.ebayClientId || !secrets.ebayClientSecret
      ? { status: "not_configured", count: 0 }
      : activeError
      ? { status: "error", count: 0, message: activeError }
      : activeStored === 0
      ? { status: "no_data", count: 0 }
      : { status: "ok", count: activeStored };

  return {
    comicId: comic.id,
    fetchedAt,
    sold: soldBandsPayload(
      combinedSales,
      gocollectStored + ebaySoldStored,
      gocollectItemId,
      breakdown,
      { gocollect: gocollectDiagnostic, ebaySold: ebaySoldDiagnostic },
    ),
    active: activeBandsPayload(
      listings,
      activeStored,
      browseEnv,
      ebayActiveDiagnostic,
    ),
  };
}

async function loadComicForUser(
  client: SupabaseClient,
  comicId: string,
): Promise<ComicRow | null> {
  const { data, error } = await client
    .from("comics")
    .select("id, org_id, title, issue, grade, grader, status")
    .eq("id", comicId)
    .maybeSingle<ComicRow>();

  if (error) {
    throw new Error(`Could not load comic: ${error.message}`);
  }

  return data;
}

function readSecrets() {
  const ebayClientId = Deno.env.get("EBAY_CLIENT_ID") ?? null;
  return {
    gocollectApiKey: Deno.env.get("GOCOLLECT_API_KEY") ?? null,
    ebayAppId: Deno.env.get("EBAY_APP_ID")?.trim() || ebayClientId,
    ebayClientId,
    ebayClientSecret: Deno.env.get("EBAY_CLIENT_SECRET") ?? null,
    ebayEnv: Deno.env.get("EBAY_OAUTH_ENV") ?? null,
    ebayBrowseClientId: Deno.env.get("EBAY_BROWSE_CLIENT_ID") ?? null,
    ebayBrowseClientSecret: Deno.env.get("EBAY_BROWSE_CLIENT_SECRET") ?? null,
    ebayBrowseEnv: Deno.env.get("EBAY_BROWSE_ENV") ?? null,
  };
}

function hasPricingConfig(secrets: ReturnType<typeof readSecrets>): boolean {
  return Boolean(
    secrets.gocollectApiKey ||
      (secrets.ebayClientId && secrets.ebayClientSecret) ||
      (secrets.ebayBrowseClientId && secrets.ebayBrowseClientSecret),
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "method_not_allowed", message: "Use POST" },
      405,
    );
  }

  const authHeader = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secrets = readSecrets();

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(
      { error: "server_misconfigured", message: "Supabase environment is not configured." },
      500,
    );
  }

  if (!hasPricingConfig(secrets)) {
    return jsonResponse(
      {
        error: "pricing_not_configured",
        message:
          "Set GOCOLLECT_API_KEY and/or EBAY_CLIENT_ID + EBAY_CLIENT_SECRET before refreshing pricing.",
      },
      503,
    );
  }

  let body: PricingRefreshRequest = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "bad_request", message: "Invalid JSON body" }, 400);
  }

  const scheduled = body.scheduled === true;
  const isServiceRole = isServiceRoleRequest(authHeader, serviceRoleKey);

  if (scheduled) {
    if (!isServiceRole) {
      return jsonResponse(
        { error: "unauthorized", message: "Scheduled refresh requires service role auth." },
        401,
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: comics, error: comicsError } = await admin
      .from("comics")
      .select("id, org_id, title, issue, grade, grader, status")
      .eq("status", "in_inventory");

    if (comicsError) {
      console.error("pricing-refresh: inventory query failed", comicsError);
      return jsonResponse(
        { error: "server_error", message: "Could not load in_inventory comics." },
        500,
      );
    }

    const results: Array<Record<string, unknown>> = [];
    let refreshed = 0;
    let failed = 0;

    for (const comic of comics ?? []) {
      try {
        const result = await refreshComicPricing(admin, comic, secrets);
        refreshed += 1;
        results.push({ ok: true, ...result });
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : "Refresh failed.";
        console.error(`pricing-refresh: comic ${comic.id} failed`, err);
        results.push({ ok: false, comicId: comic.id, error: message });
      }

      await sleep(SCHEDULED_DELAY_MS);
    }

    return jsonResponse({
      scheduled: true,
      total: (comics ?? []).length,
      refreshed,
      failed,
      results,
    });
  }

  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(
      { error: "unauthorized", message: "Missing or invalid Authorization header" },
      401,
    );
  }

  const comicId = body.comicId?.trim();
  if (!comicId) {
    return jsonResponse(
      { error: "bad_request", message: "comicId is required." },
      400,
    );
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return jsonResponse(
      { error: "unauthorized", message: "Invalid or expired session" },
      401,
    );
  }

  let comic: ComicRow | null;
  try {
    comic = await loadComicForUser(supabaseUser, comicId);
  } catch (err) {
    console.error("pricing-refresh: comic load failed", err);
    return jsonResponse(
      { error: "server_error", message: "Could not load comic." },
      500,
    );
  }

  if (!comic) {
    return jsonResponse(
      { error: "not_found", message: "Comic not found or access denied." },
      404,
    );
  }

  try {
    const result = await refreshComicPricing(supabaseUser, comic, secrets);
    return jsonResponse(result as unknown as Record<string, unknown>);
  } catch (err) {
    console.error("pricing-refresh: failed", err);
    return jsonResponse(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "Pricing refresh failed.",
      },
      500,
    );
  }
});
