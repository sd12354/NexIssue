/**
 * shippo-create-label — purchase Shippo label for a sale (PRD Phase 4).
 *
 * POST { saleId } — authenticated
 *
 * Deploy:
 *   supabase functions deploy shippo-create-label
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import { CORS_HEADERS, jsonResponse } from "../_shared/cors.ts";
import { decryptJson, type EncryptedBlob } from "../_shared/encryption.ts";
import { notifyOrgMembers } from "../_shared/push.ts";
import {
  createShippoShipment,
  DEFAULT_SLAB_PRESET,
  mapDbAddress,
  pickShippoRate,
  purchaseShippoLabel,
  ShippoError,
  type ShippoParcel,
} from "../_shared/shippo.ts";

type CreateLabelRequest = { saleId?: string };

type SaleRow = {
  id: string;
  org_id: string;
  listing_id: string;
  sold_price: number;
  buyer_address: Record<string, unknown> | null;
  buyer_username: string | null;
  status: string;
  listings: {
    comic_id: string;
    comics: {
      title: string | null;
      issue: string | null;
    } | null;
  } | null;
};

type PresetRow = {
  length: number;
  width: number;
  height: number;
  weight: number;
  distance_unit: string;
  mass_unit: string;
};

const LABELS_BUCKET = "shipping-labels";

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
  const encryptionKey = Deno.env.get("OAUTH_TOKEN_ENCRYPTION_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !encryptionKey) {
    return jsonResponse(
      { error: "server_misconfigured", message: "Label service is not configured." },
      500,
    );
  }

  let body: CreateLabelRequest = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "bad_request", message: "Invalid JSON body" }, 400);
  }

  const saleId = typeof body.saleId === "string" ? body.saleId.trim() : "";
  if (!saleId) {
    return jsonResponse(
      { error: "missing_sale_id", message: "saleId is required." },
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

  const { data: sale, error: saleError } = await supabaseUser
    .from("sales")
    .select(`
      id,
      org_id,
      listing_id,
      sold_price,
      buyer_address,
      buyer_username,
      status,
      listings (
        comic_id,
        comics ( title, issue )
      )
    `)
    .eq("id", saleId)
    .maybeSingle<SaleRow>();

  if (saleError) {
    console.error("shippo-create-label: sale lookup failed", saleError);
    return jsonResponse(
      { error: "server_error", message: "Could not load sale." },
      500,
    );
  }
  if (!sale) {
    return jsonResponse(
      { error: "not_found", message: "Sale not found or access denied." },
      404,
    );
  }

  const { data: integration, error: integrationError } = await admin
    .from("org_integrations")
    .select("credentials")
    .eq("org_id", sale.org_id)
    .eq("provider", "shippo")
    .maybeSingle<{ credentials: EncryptedBlob }>();

  if (integrationError || !integration?.credentials) {
    return jsonResponse(
      { error: "shippo_not_connected", message: "Shippo not connected" },
      400,
    );
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("shipping_from")
    .eq("id", sale.org_id)
    .maybeSingle<{ shipping_from: Record<string, unknown> | null }>();

  if (orgError) {
    console.error("shippo-create-label: org lookup failed", orgError);
    return jsonResponse(
      { error: "server_error", message: "Could not load organization." },
      500,
    );
  }

  const addressFrom = org?.shipping_from
    ? mapDbAddress(org.shipping_from)
    : null;
  if (!addressFrom) {
    return jsonResponse(
      { error: "no_from_address", message: "No shipping address configured" },
      400,
    );
  }

  const buyerRaw = sale.buyer_address ?? {};
  const addressTo = mapDbAddress(buyerRaw);
  if (!addressTo) {
    return jsonResponse(
      {
        error: "no_buyer_address",
        message: "Sale is missing a valid buyer shipping address.",
      },
      400,
    );
  }

  let parcel: ShippoParcel = DEFAULT_SLAB_PRESET;
  const { data: preset } = await admin
    .from("org_shipping_presets")
    .select("length, width, height, weight, distance_unit, mass_unit")
    .eq("org_id", sale.org_id)
    .eq("is_default", true)
    .maybeSingle<PresetRow>();

  if (preset) {
    parcel = {
      length: Number(preset.length),
      width: Number(preset.width),
      height: Number(preset.height),
      weight: Number(preset.weight),
      distance_unit: preset.distance_unit ?? "in",
      mass_unit: preset.mass_unit ?? "oz",
    };
  }

  let apiKey: string;
  try {
    const decrypted = await decryptJson<{ api_token?: string }>(
      integration.credentials,
      encryptionKey,
    );
    apiKey = decrypted.api_token?.trim() ?? "";
    if (!apiKey) throw new Error("Missing api_token");
  } catch (err) {
    console.error("shippo-create-label: decrypt failed", err);
    return jsonResponse(
      { error: "server_error", message: "Could not read Shippo credentials." },
      500,
    );
  }

  let shipment;
  let rate;
  let transaction;
  try {
    shipment = await createShippoShipment(apiKey, {
      addressFrom,
      addressTo,
      parcel,
    });
    rate = pickShippoRate(shipment.rates ?? []);
    if (!rate) {
      return jsonResponse(
        { error: "no_rates", message: "Shippo returned no shipping rates for this parcel." },
        502,
      );
    }
    transaction = await purchaseShippoLabel(apiKey, rate.object_id);
  } catch (err) {
    const message = err instanceof ShippoError
      ? err.message
      : "Shippo label creation failed.";
    return jsonResponse({ error: "shippo_api_error", message }, 502);
  }

  if (transaction.status !== "SUCCESS") {
    const detail = transaction.messages?.map((m) => m.text).filter(Boolean).join("; ")
      ?? "Shippo could not purchase the label.";
    return jsonResponse({ error: "shippo_api_error", message: detail }, 502);
  }

  const trackingNumber = transaction.tracking_number ?? null;
  const trackingUrl = transaction.tracking_url_provider ?? null;
  const labelStoragePath = `${sale.org_id}/labels/${sale.id}.pdf`;
  let storedLabelPath: string | null = null;

  if (transaction.label_url) {
    try {
      const pdfResponse = await fetch(transaction.label_url);
      if (pdfResponse.ok) {
        const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
        const { error: uploadError } = await admin.storage
          .from(LABELS_BUCKET)
          .upload(labelStoragePath, pdfBytes, {
            contentType: "application/pdf",
            upsert: true,
          });
        if (uploadError) {
          console.error("shippo-create-label: upload failed", uploadError);
        } else {
          storedLabelPath = labelStoragePath;
        }
      }
    } catch (err) {
      console.error("shippo-create-label: label download failed", err);
    }
  }

  const labelCost = rate.amount ? Number(rate.amount) : null;
  const { error: updateError } = await admin
    .from("sales")
    .update({
      shippo_label_id: transaction.object_id,
      tracking_number: trackingNumber,
      tracking_url: trackingUrl,
      label_storage_path: storedLabelPath,
      shippo_label_cost: labelCost,
      status: "label_created",
    })
    .eq("id", sale.id);

  if (updateError) {
    console.error("shippo-create-label: sale update failed", updateError);
    return jsonResponse(
      { error: "server_error", message: "Label purchased but sale update failed." },
      500,
    );
  }

  const comicTitle = sale.listings?.comics?.title ?? "Comic";
  const issue = sale.listings?.comics?.issue;
  const titleLine = issue ? `${comicTitle} #${issue}` : comicTitle;

  await notifyOrgMembers(sale.org_id, {
    title: "Label ready",
    body: `📦 Label ready for ${titleLine}${trackingNumber ? ` — ${trackingNumber}` : ""}`,
    data: { saleId: sale.id, type: "label_ready" },
  });

  return jsonResponse({
    saleId: sale.id,
    trackingNumber,
    trackingUrl,
    labelStoragePath: storedLabelPath,
    shippoLabelId: transaction.object_id,
    shippoLabelCost: labelCost,
    status: "label_created",
    pdfStored: Boolean(storedLabelPath),
  });
});
