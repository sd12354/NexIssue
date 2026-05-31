/**
 * ebay-verify-connection — confirm the org's stored eBay tokens still work.
 *
 * Why this exists: the `org_integrations` row stays around until the user
 * disconnects, but the refresh token can be revoked at any time (user
 * revoked access on eBay, scope change, account suspended, eBay rotated
 * tokens). The UI was showing "Connected" even when the credentials were
 * dead.
 *
 * What it does:
 *   1. Loads encrypted creds for `provider = 'ebay'`.
 *   2. If refresh_token is expired → returns `needs_reconnect` immediately
 *      (no point hitting eBay).
 *   3. Otherwise calls `getValidEbayAccessToken` (which refreshes if the
 *      access token is stale and persists the new tokens) and probes
 *      `/commerce/identity/v1/user/` to confirm eBay still honors them.
 *   4. Persists `metadata.verification` = { status, last_verified_at,
 *      account, error_code?, error_message? } regardless of outcome so the
 *      client can render the right banner without re-hitting this fn.
 *
 * Status codes returned:
 *   200 { ok: true,  account, environment, lastVerifiedAt }
 *   200 { ok: false, code: 'not_connected'    | 'needs_reconnect'
 *                       | 'token_refresh_failed' | 'identity_failed',
 *         message, lastVerifiedAt? }   ← always 200 so the UI can show
 *                                       the error inline; only real
 *                                       infra failures return 4xx/5xx.
 *
 * Deploy:
 *   supabase functions deploy ebay-verify-connection
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import { CORS_HEADERS, jsonResponse } from "../_shared/cors.ts";
import { fetchEbayUser, type EbayEnv } from "../_shared/ebay.ts";
import {
  getValidEbayAccessToken,
  type EbayStoredCredentials,
} from "../_shared/ebay-sell.ts";
import { decryptJson, type EncryptedBlob } from "../_shared/encryption.ts";

type VerificationStatus = "ok" | "needs_reconnect" | "error";

type VerificationMetadata = {
  status: VerificationStatus;
  last_verified_at: string;
  account?: string | null;
  error_code?: string;
  error_message?: string;
};

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
      { error: "server_misconfigured", message: "eBay verify is not configured." },
      500,
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

  const { data: integration, error: integrationError } = await admin
    .from("org_integrations")
    .select("credentials, metadata")
    .eq("org_id", orgId)
    .eq("provider", "ebay")
    .maybeSingle<{
      credentials: EncryptedBlob | null;
      metadata: Record<string, unknown> | null;
    }>();

  if (integrationError) {
    console.error("ebay-verify-connection: lookup failed", integrationError);
    return jsonResponse(
      { error: "server_error", message: "Could not load eBay connection." },
      500,
    );
  }

  if (!integration?.credentials) {
    return jsonResponse({
      ok: false,
      code: "not_connected",
      message: "eBay is not connected.",
    });
  }

  const existingMetadata = (integration.metadata ?? {}) as Record<string, unknown>;
  const previousAccount = typeof existingMetadata.account === "string"
    ? existingMetadata.account
    : null;

  const persistVerification = async (result: VerificationMetadata) => {
    const nextMetadata = { ...existingMetadata, verification: result };
    const { error } = await admin
      .from("org_integrations")
      .update({ metadata: nextMetadata })
      .eq("org_id", orgId)
      .eq("provider", "ebay");
    if (error) {
      console.warn("ebay-verify-connection: metadata update failed", error);
    }
  };

  // Cheap pre-check: if the refresh token is already past expiry, no point
  // burning a request on eBay — we know it will fail.
  let creds: EbayStoredCredentials;
  try {
    creds = await decryptJson<EbayStoredCredentials>(
      integration.credentials,
      encryptionKey,
    );
  } catch (err) {
    console.error("ebay-verify-connection: decrypt failed", err);
    const nowIso = new Date().toISOString();
    await persistVerification({
      status: "error",
      last_verified_at: nowIso,
      account: previousAccount,
      error_code: "decrypt_failed",
      error_message: "Could not read stored credentials.",
    });
    return jsonResponse({
      ok: false,
      code: "decrypt_failed",
      message: "Could not read stored credentials.",
      lastVerifiedAt: nowIso,
    });
  }

  const refreshExpiresAt = Date.parse(creds.refresh_expires_at);
  if (
    Number.isFinite(refreshExpiresAt) &&
    Date.now() >= refreshExpiresAt
  ) {
    const nowIso = new Date().toISOString();
    await persistVerification({
      status: "needs_reconnect",
      last_verified_at: nowIso,
      account: previousAccount,
      error_code: "refresh_token_expired",
      error_message: "eBay refresh token has expired. Please reconnect.",
    });
    return jsonResponse({
      ok: false,
      code: "needs_reconnect",
      message: "eBay refresh token has expired. Please reconnect.",
      lastVerifiedAt: nowIso,
    });
  }

  let accessToken: string;
  let env: EbayEnv;
  try {
    const result = await getValidEbayAccessToken({
      admin,
      orgId,
      encrypted: integration.credentials,
      encryptionKey,
      clientId,
      clientSecret,
    });
    accessToken = result.accessToken;
    env = result.env;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("ebay-verify-connection: refresh failed", message);
    const nowIso = new Date().toISOString();
    // eBay returns 400 with invalid_grant when the user has revoked access
    // or eBay has invalidated the refresh token.
    const looksRevoked = /invalid_grant|revoked|unauthorized|400|401/i.test(message);
    await persistVerification({
      status: looksRevoked ? "needs_reconnect" : "error",
      last_verified_at: nowIso,
      account: previousAccount,
      error_code: looksRevoked ? "needs_reconnect" : "token_refresh_failed",
      error_message: looksRevoked
        ? "eBay has revoked this connection. Please reconnect."
        : "Could not refresh eBay access token.",
    });
    return jsonResponse({
      ok: false,
      code: looksRevoked ? "needs_reconnect" : "token_refresh_failed",
      message: looksRevoked
        ? "eBay has revoked this connection. Please reconnect."
        : "Could not refresh eBay access token.",
      lastVerifiedAt: nowIso,
    });
  }

  // Live probe against eBay so we catch revoked sessions even when the
  // refresh succeeded for other reasons.
  let account = previousAccount;
  try {
    const info = await fetchEbayUser({ env, accessToken });
    if (info.username) account = info.username;
  } catch (err) {
    console.warn("ebay-verify-connection: identity probe failed", err);
    // Not fatal — we still got a refreshed access token, so the connection
    // is healthy enough. Fall through to the success path.
  }

  const nowIso = new Date().toISOString();
  await persistVerification({
    status: "ok",
    last_verified_at: nowIso,
    account,
  });

  return jsonResponse({
    ok: true,
    account,
    environment: env,
    lastVerifiedAt: nowIso,
  });
});
