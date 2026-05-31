/**
 * shippo-connect — store encrypted Shippo API key per org (PRD Phase 4).
 *
 * POST { apiKey } — authenticated
 *
 * Deploy:
 *   supabase functions deploy shippo-connect
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import { CORS_HEADERS, jsonResponse } from "../_shared/cors.ts";
import { decryptJson, encryptJson, type EncryptedBlob } from "../_shared/encryption.ts";
import { ShippoError, testShippoAccount } from "../_shared/shippo.ts";

type ConnectRequest = { apiKey?: string; testOnly?: boolean };

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
      { error: "server_misconfigured", message: "Shippo connect is not configured." },
      500,
    );
  }

  let body: ConnectRequest = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "bad_request", message: "Invalid JSON body" }, 400);
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const testOnly = body.testOnly === true;

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

  let keyToTest = apiKey;
  if (testOnly) {
    const { data: integration } = await admin
      .from("org_integrations")
      .select("credentials, metadata")
      .eq("org_id", membership.org_id)
      .eq("provider", "shippo")
      .maybeSingle<{ credentials: EncryptedBlob; metadata: Record<string, unknown> | null }>();

    if (!integration?.credentials) {
      return jsonResponse(
        { error: "shippo_not_connected", message: "Shippo not connected" },
        400,
      );
    }

    try {
      const decrypted = await decryptJson<{ api_token?: string }>(
        integration.credentials,
        encryptionKey,
      );
      keyToTest = decrypted.api_token?.trim() ?? "";
    } catch {
      return jsonResponse(
        { error: "server_error", message: "Could not read Shippo credentials." },
        500,
      );
    }
  }

  if (!keyToTest) {
    return jsonResponse(
      { error: "missing_api_key", message: "apiKey is required." },
      400,
    );
  }

  try {
    await testShippoAccount(keyToTest);
  } catch (err) {
    const message = err instanceof ShippoError
      ? err.message
      : "Invalid API key — check and try again.";
    const status = err instanceof ShippoError && err.status === 401 ? 401 : 502;
    return jsonResponse({ error: "shippo_auth_failed", message }, status);
  }

  const testMode = keyToTest.startsWith("shippo_test_");
  const account = testMode ? "Shippo (test mode)" : "Shippo";

  if (testOnly) {
    return jsonResponse({ success: true, account, testMode });
  }

  const credentials = await encryptJson({ api_token: apiKey }, encryptionKey);
  const now = new Date().toISOString();

  const { error: upsertError } = await admin.from("org_integrations").upsert(
    {
      org_id: membership.org_id,
      provider: "shippo",
      credentials,
      metadata: { account, test_mode: testMode },
      connected_at: now,
      last_used_at: now,
    },
    { onConflict: "org_id,provider" },
  );

  if (upsertError) {
    console.error("shippo-connect: upsert failed", upsertError);
    return jsonResponse(
      { error: "server_error", message: "Could not save Shippo integration." },
      500,
    );
  }

  return jsonResponse({
    success: true,
    account,
    testMode,
  });
});
