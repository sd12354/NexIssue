/**
 * shippo-webhook — tracking updates from Shippo (PRD Phase 4).
 *
 * Register in Shippo dashboard:
 *   https://<project-ref>.supabase.co/functions/v1/shippo-webhook
 *
 * Deploy:
 *   supabase functions deploy shippo-webhook --no-verify-jwt
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import { CORS_HEADERS, jsonResponse } from "../_shared/cors.ts";
import { notifyOrgMembers } from "../_shared/push.ts";

type ShippoTrackPayload = {
  event?: string;
  data?: {
    tracking_number?: string;
    tracking_status?: {
      status?: string;
      status_details?: string;
    };
    eta?: string;
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed", message: "Use POST" }, 405);
  }

  const webhookToken = Deno.env.get("SHIPPO_WEBHOOK_TOKEN");
  const authHeader = req.headers.get("Shippo-Auth") ??
    req.headers.get("Authorization");

  if (webhookToken) {
    const expected = `ShippoToken ${webhookToken}`;
    if (authHeader !== expected && authHeader !== webhookToken) {
      return jsonResponse({ error: "unauthorized", message: "Invalid webhook token" }, 401);
    }
  }

  let payload: ShippoTrackPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "bad_request", message: "Invalid JSON body" }, 400);
  }

  if (payload.event !== "track_updated") {
    return jsonResponse({ ok: true, ignored: true });
  }

  const trackingNumber = payload.data?.tracking_number?.trim();
  if (!trackingNumber) {
    return jsonResponse({ ok: true, ignored: true });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { error: "server_misconfigured", message: "Webhook handler not configured." },
      500,
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: sale, error: saleError } = await admin
    .from("sales")
    .select(`
      id,
      org_id,
      status,
      shipped_at,
      listings (
        comics ( title, issue )
      )
    `)
    .eq("tracking_number", trackingNumber)
    .maybeSingle();

  if (saleError) {
    console.error("shippo-webhook: sale lookup failed", saleError);
    return jsonResponse({ error: "server_error", message: "Lookup failed." }, 500);
  }
  if (!sale) {
    return jsonResponse({ ok: true, ignored: true });
  }

  const trackingStatus = payload.data?.tracking_status?.status ?? null;
  const eta = payload.data?.eta ?? null;
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = {
    tracking_status: trackingStatus,
    estimated_delivery: eta,
  };

  const normalized = trackingStatus?.toUpperCase() ?? "";
  if (normalized === "DELIVERED") {
    updates.delivered_at = now;
    updates.status = "delivered";
  } else if (
    normalized.includes("TRANSIT") ||
    normalized.includes("IN_TRANSIT") ||
    normalized === "TRANSIT"
  ) {
    if (!sale.shipped_at) updates.shipped_at = now;
    updates.status = "shipped";
  }

  const { error: updateError } = await admin
    .from("sales")
    .update(updates)
    .eq("id", sale.id);

  if (updateError) {
    console.error("shippo-webhook: update failed", updateError);
    return jsonResponse({ error: "server_error", message: "Update failed." }, 500);
  }

  if (normalized === "DELIVERED") {
    const comics = sale.listings as { comics?: { title?: string; issue?: string } } | null;
    const title = comics?.comics?.title ?? "Comic";
    const issue = comics?.comics?.issue;
    const titleLine = issue ? `${title} #${issue}` : title;

    await notifyOrgMembers(sale.org_id, {
      title: "Delivered",
      body: `✅ Delivered: ${titleLine}`,
      data: { saleId: sale.id, type: "delivered" },
    });
  }

  return jsonResponse({ ok: true });
});
