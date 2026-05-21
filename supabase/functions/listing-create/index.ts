/**
 * listing-create — publish a catalog comic to eBay (PRD §5.4).
 *
 * Flow:
 *   1. Authenticate caller and resolve org.
 *   2. Load comic + photos; verify status is `in_inventory`.
 *   3. Decrypt eBay OAuth tokens (refresh if needed).
 *   4. Create inventory item → offer → publish on eBay Sell Inventory API.
 *   5. Insert `listings` row and mark comic `listed`.
 *
 * Required Supabase secrets (in addition to eBay OAuth secrets):
 *   - EBAY_CATEGORY_ID              (default 259104 — Collectible Comic Books)
 *   - EBAY_FULFILLMENT_POLICY_ID    (optional — auto-fetched from Account API)
 *   - EBAY_PAYMENT_POLICY_ID        (optional)
 *   - EBAY_RETURN_POLICY_ID         (optional)
 *   - EBAY_MERCHANT_LOCATION_KEY    (optional — auto-fetched from Inventory API)
 *
 * Deploy:
 *   supabase functions deploy listing-create
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import { CORS_HEADERS, jsonResponse } from "../_shared/cors.ts";
import {
  buildListingUrl,
  createOffer,
  getValidEbayAccessToken,
  publishOffer,
  resolveListingPolicies,
  resolveMerchantLocationKey,
  upsertInventoryItem,
} from "../_shared/ebay-sell.ts";
import type { EncryptedBlob } from "../_shared/encryption.ts";

type ListingCreateRequest = {
  comicId?: string;
  title?: string;
  description?: string;
  askingPrice?: number;
};

type ComicRow = {
  id: string;
  org_id: string;
  cert_number: string;
  grader: string;
  title: string | null;
  issue: string | null;
  variant: string | null;
  year: number | null;
  grade: number | null;
  key_notes: string[] | null;
  encapsulation_date: string | null;
  status: string;
};

type PhotoRow = {
  storage_path: string;
  position: string;
};

const COMIC_PHOTOS_BUCKET = "comic-photos";
const DEFAULT_CATEGORY_ID = "259104";
const SIGNED_URL_TTL = 60 * 60;

function aspectsFromComic(comic: ComicRow): Record<string, string[]> {
  const aspects: Record<string, string[]> = {
    "Professional Grader": [comic.grader],
    "Certification Number": [comic.cert_number],
    Graded: ["Yes"],
  };
  if (comic.grade != null) {
    aspects.Grade = [Number(comic.grade).toFixed(1)];
  }
  if (comic.issue?.trim()) aspects["Issue Number"] = [comic.issue.trim()];
  if (comic.year != null) aspects["Publication Year"] = [String(comic.year)];
  if (comic.variant?.trim()) aspects.Variant = [comic.variant.trim()];
  const keyNotes = (comic.key_notes ?? []).filter((n) => n.trim());
  if (keyNotes.length > 0) aspects["Key Notes"] = [keyNotes.join("; ")];
  return aspects;
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
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse(
      { error: "unauthorized", message: "Missing or invalid Authorization header" },
      401,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("EBAY_CLIENT_ID");
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET");
  const encryptionKey = Deno.env.get("OAUTH_TOKEN_ENCRYPTION_KEY");

  if (
    !supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !clientId ||
    !clientSecret || !encryptionKey
  ) {
    return jsonResponse(
      { error: "server_misconfigured", message: "Listing service is not configured." },
      500,
    );
  }

  let body: ListingCreateRequest;
  try {
    body = (await req.json()) as ListingCreateRequest;
  } catch {
    return jsonResponse(
      { error: "invalid_body", message: "Request body must be JSON." },
      400,
    );
  }

  const comicId = typeof body.comicId === "string" ? body.comicId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string"
    ? body.description.trim()
    : "";
  const askingPrice = typeof body.askingPrice === "number"
    ? body.askingPrice
    : Number.NaN;

  if (!comicId) {
    return jsonResponse(
      { error: "missing_comic", message: "comicId is required." },
      400,
    );
  }
  if (!title) {
    return jsonResponse(
      { error: "missing_title", message: "Listing title is required." },
      400,
    );
  }
  if (!description) {
    return jsonResponse(
      { error: "missing_description", message: "Listing description is required." },
      400,
    );
  }
  if (!Number.isFinite(askingPrice) || askingPrice <= 0) {
    return jsonResponse(
      { error: "invalid_price", message: "askingPrice must be a positive number." },
      400,
    );
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return jsonResponse(
      { error: "unauthorized", message: "Invalid or expired session" },
      401,
    );
  }

  const { data: membership, error: membershipError } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return jsonResponse(
      { error: "no_org", message: "User has no organization membership." },
      400,
    );
  }

  const orgId = membership.org_id;

  const { data: comic, error: comicError } = await admin
    .from("comics")
    .select(
      "id, org_id, cert_number, grader, title, issue, variant, year, grade, key_notes, encapsulation_date, status",
    )
    .eq("org_id", orgId)
    .eq("id", comicId)
    .maybeSingle<ComicRow>();

  if (comicError) {
    console.error("listing-create: comic lookup failed", comicError);
    return jsonResponse(
      { error: "server_error", message: "Could not load comic." },
      500,
    );
  }
  if (!comic) {
    return jsonResponse(
      { error: "comic_not_found", message: "Comic not found in your catalog." },
      404,
    );
  }
  if (comic.status !== "in_inventory") {
    return jsonResponse(
      {
        error: "invalid_status",
        message: `This comic is already ${comic.status.replace(/_/g, " ")}.`,
      },
      400,
    );
  }

  const { data: integration, error: integrationError } = await admin
    .from("org_integrations")
    .select("credentials")
    .eq("org_id", orgId)
    .eq("provider", "ebay")
    .maybeSingle<{ credentials: EncryptedBlob }>();

  if (integrationError) {
    console.error("listing-create: integration lookup failed", integrationError);
    return jsonResponse(
      { error: "server_error", message: "Could not load eBay connection." },
      500,
    );
  }
  if (!integration?.credentials) {
    return jsonResponse(
      {
        error: "ebay_not_connected",
        message: "Connect your eBay account in Settings → Integrations before listing.",
      },
      400,
    );
  }

  const { data: photos, error: photosError } = await admin
    .from("photos")
    .select("storage_path, position")
    .eq("org_id", orgId)
    .eq("comic_id", comicId)
    .order("position", { ascending: true });

  if (photosError) {
    console.error("listing-create: photos lookup failed", photosError);
    return jsonResponse(
      { error: "server_error", message: "Could not load comic photos." },
      500,
    );
  }

  const orderedPhotos = (photos ?? []) as PhotoRow[];
  const frontFirst = [
    ...orderedPhotos.filter((p) => p.position === "front"),
    ...orderedPhotos.filter((p) => p.position !== "front"),
  ];

  const imageUrls: string[] = [];
  for (const photo of frontFirst) {
    const { data: signed, error: signError } = await admin.storage
      .from(COMIC_PHOTOS_BUCKET)
      .createSignedUrl(photo.storage_path, SIGNED_URL_TTL);
    if (signError) {
      console.warn("listing-create: signed URL failed", signError, photo.storage_path);
      continue;
    }
    if (signed?.signedUrl) imageUrls.push(signed.signedUrl);
  }

  if (imageUrls.length === 0) {
    return jsonResponse(
      {
        error: "missing_photos",
        message: "Add at least one cover photo before listing on eBay.",
      },
      400,
    );
  }

  let accessToken: string;
  let env: "production" | "sandbox";
  try {
    const tokenResult = await getValidEbayAccessToken({
      admin,
      orgId,
      encrypted: integration.credentials,
      encryptionKey,
      clientId,
      clientSecret,
    });
    accessToken = tokenResult.accessToken;
    env = tokenResult.env;
  } catch (err) {
    console.error("listing-create: token refresh failed", err);
    return jsonResponse(
      {
        error: "ebay_auth_failed",
        message: "eBay session expired. Reconnect eBay in Settings → Integrations.",
      },
      502,
    );
  }

  const categoryId = Deno.env.get("EBAY_CATEGORY_ID")?.trim() || DEFAULT_CATEGORY_ID;
  const sku = comic.id;

  try {
    const policies = await resolveListingPolicies({
      env,
      accessToken,
      fulfillmentPolicyId: Deno.env.get("EBAY_FULFILLMENT_POLICY_ID"),
      paymentPolicyId: Deno.env.get("EBAY_PAYMENT_POLICY_ID"),
      returnPolicyId: Deno.env.get("EBAY_RETURN_POLICY_ID"),
    });

    const merchantLocationKey = await resolveMerchantLocationKey({
      env,
      accessToken,
      preferredKey: Deno.env.get("EBAY_MERCHANT_LOCATION_KEY"),
    });

    await upsertInventoryItem({
      env,
      accessToken,
      sku,
      title,
      description,
      imageUrls,
      aspects: aspectsFromComic(comic),
    });

    const offerId = await createOffer({
      env,
      accessToken,
      sku,
      categoryId,
      description,
      price: askingPrice,
      policies,
      merchantLocationKey,
    });

    const marketplaceListingId = await publishOffer({
      env,
      accessToken,
      offerId,
    });

    const now = new Date().toISOString();
    const { data: listing, error: listingError } = await admin
      .from("listings")
      .insert({
        org_id: orgId,
        comic_id: comicId,
        marketplace: "ebay",
        marketplace_listing_id: marketplaceListingId,
        status: "published",
        asking_price: askingPrice,
        title,
        description,
        published_at: now,
      })
      .select("id")
      .single();

    if (listingError) {
      console.error("listing-create: listings insert failed", listingError);
      return jsonResponse(
        {
          error: "persist_failed",
          message:
            "Listing was published on eBay but could not be saved locally. Check your eBay account.",
          marketplaceListingId,
        },
        500,
      );
    }

    const { error: comicUpdateError } = await admin
      .from("comics")
      .update({ status: "listed" })
      .eq("org_id", orgId)
      .eq("id", comicId);

    if (comicUpdateError) {
      console.warn("listing-create: comic status update failed", comicUpdateError);
    }

    return jsonResponse({
      listingId: listing.id,
      marketplaceListingId,
      listingUrl: buildListingUrl(env, marketplaceListingId),
      environment: env,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "eBay listing failed.";
    console.error("listing-create: publish failed", err);
    return jsonResponse(
      { error: "ebay_publish_failed", message },
      502,
    );
  }
});
