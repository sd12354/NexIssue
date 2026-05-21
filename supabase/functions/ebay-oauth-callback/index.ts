/**
 * ebay-oauth-callback — handle eBay's OAuth redirect (PRD §9).
 *
 * eBay sends the user here as a GET with `code`, `state`, and `expires_in`
 * after they authorize the app. This function:
 *
 *   1. Validates the `state` against `oauth_states` (single-use, 15 min TTL).
 *   2. Exchanges the auth code for refresh + access tokens.
 *   3. Fetches the connected eBay account's username (non-secret metadata).
 *   4. Encrypts the token payload with AES-256-GCM (key in Supabase secret
 *      `OAUTH_TOKEN_ENCRYPTION_KEY`) and upserts into `org_integrations`.
 *   5. 302-redirects the browser back to the mobile app deep link
 *      (`<scheme>://oauth/ebay/callback?status=success|error&...`). The
 *      mobile app catches this via `expo-web-browser.openAuthSessionAsync`.
 *
 * Required Supabase secrets:
 *   - EBAY_CLIENT_ID
 *   - EBAY_CLIENT_SECRET
 *   - EBAY_RUNAME
 *   - EBAY_OAUTH_ENV               (`production` | `sandbox`)
 *   - EBAY_OAUTH_RETURN_SCHEME     (default `nexissue`)
 *   - OAUTH_TOKEN_ENCRYPTION_KEY   (base64 of 32 random bytes)
 *
 * Edge function config: this function has `verify_jwt = false` because eBay
 * cannot send a Supabase session JWT. Security is enforced by:
 *   - The opaque random `state` token (single-use, TTL-scoped, never
 *     reusable after consumption).
 *   - eBay-side client secret in the token exchange.
 *
 * Deploy:
 *   supabase functions deploy ebay-oauth-callback --no-verify-jwt
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import { CORS_HEADERS } from "../_shared/cors.ts";
import {
  type EbayEnv,
  type EbayTokenResponse,
  exchangeCodeForTokens,
  fetchEbayUser,
} from "../_shared/ebay.ts";
import { encryptJson } from "../_shared/encryption.ts";

type CallbackErrorCode =
  | "missing_params"
  | "invalid_state"
  | "expired_state"
  | "state_already_consumed"
  | "token_exchange_failed"
  | "encryption_failed"
  | "persist_failed"
  | "server_misconfigured"
  | "ebay_denied";

function htmlError(message: string): Response {
  const escaped = message.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[
      c
    ]!);
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>NexIssue · eBay connection</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0D0D12;color:#F4F4F8;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
      .card{background:#16161F;border:1px solid #252532;border-radius:14px;padding:24px;max-width:360px;text-align:center}
      h1{font-size:18px;margin:0 0 8px;color:#FF5C7A}
      p{font-size:14px;color:#9B9BB0;line-height:1.5;margin:0}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Could not finish connecting eBay</h1>
      <p>${escaped}</p>
      <p style="margin-top:12px">You can close this window and try again from the app.</p>
    </div>
  </body>
</html>`,
    {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

function redirectToApp(opts: {
  scheme: string;
  status: "success" | "error";
  errorCode?: CallbackErrorCode;
  errorMessage?: string;
  account?: string | null;
  environment?: EbayEnv;
}): Response {
  const params = new URLSearchParams();
  params.set("status", opts.status);
  if (opts.status === "error") {
    if (opts.errorCode) params.set("error_code", opts.errorCode);
    if (opts.errorMessage) params.set("error_message", opts.errorMessage);
  } else {
    if (opts.account) params.set("account", opts.account);
    if (opts.environment) params.set("environment", opts.environment);
  }
  const target =
    `${opts.scheme}://oauth/ebay/callback?${params.toString()}`;

  return new Response(
    `<!doctype html>
<html><head>
  <meta http-equiv="refresh" content="0;url=${target}" />
  <title>Connecting…</title>
  <style>
    body{background:#0D0D12;color:#F4F4F8;font-family:-apple-system,sans-serif;text-align:center;padding:48px}
    a{color:#7C5CFF}
  </style>
</head>
<body>
  <p>Returning you to NexIssue…</p>
  <p><a href="${target}">Open NexIssue</a></p>
  <script>window.location.replace(${JSON.stringify(target)});</script>
</body></html>`,
    {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

type OAuthStateRow = {
  state: string;
  provider: "ebay" | "shippo" | "gocollect";
  org_id: string;
  user_id: string;
  return_scheme: string | null;
  expires_at: string;
  consumed_at: string | null;
};

async function consumeState(
  admin: SupabaseClient,
  state: string,
): Promise<
  | { ok: true; row: OAuthStateRow }
  | { ok: false; code: CallbackErrorCode; message: string }
> {
  const { data, error } = await admin
    .from("oauth_states")
    .select(
      "state, provider, org_id, user_id, return_scheme, expires_at, consumed_at",
    )
    .eq("state", state)
    .maybeSingle<OAuthStateRow>();

  if (error) {
    console.error("oauth_states lookup failed", error);
    return {
      ok: false,
      code: "invalid_state",
      message: "Could not look up OAuth state.",
    };
  }
  if (!data) {
    return {
      ok: false,
      code: "invalid_state",
      message: "Unknown OAuth state token.",
    };
  }
  if (data.consumed_at) {
    return {
      ok: false,
      code: "state_already_consumed",
      message: "OAuth state has already been used.",
    };
  }
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      code: "expired_state",
      message: "OAuth state has expired. Please retry from the app.",
    };
  }

  const { error: consumeError } = await admin
    .from("oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state", state)
    .is("consumed_at", null);
  if (consumeError) {
    console.error("oauth_states consume failed", consumeError);
    return {
      ok: false,
      code: "invalid_state",
      message: "Could not consume OAuth state.",
    };
  }

  return { ok: true, row: data };
}

async function persistIntegration(opts: {
  admin: SupabaseClient;
  orgId: string;
  tokens: EbayTokenResponse;
  username: string | null;
  scopes: string;
  env: EbayEnv;
  encryptionKey: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const now = new Date();
  const accessExpiresAt = new Date(
    now.getTime() + opts.tokens.expires_in * 1000,
  ).toISOString();
  const refreshExpiresAt = new Date(
    now.getTime() + opts.tokens.refresh_token_expires_in * 1000,
  ).toISOString();

  let encrypted;
  try {
    encrypted = await encryptJson(
      {
        access_token: opts.tokens.access_token,
        refresh_token: opts.tokens.refresh_token,
        token_type: opts.tokens.token_type,
        access_expires_at: accessExpiresAt,
        refresh_expires_at: refreshExpiresAt,
        scopes: opts.scopes,
        environment: opts.env,
      },
      opts.encryptionKey,
    );
  } catch (err) {
    console.error("encryption failed", err);
    return { ok: false, message: "Could not encrypt eBay tokens." };
  }

  const metadata = {
    account: opts.username,
    environment: opts.env,
    scopes: opts.scopes.split(/\s+/).filter(Boolean),
    access_expires_at: accessExpiresAt,
    refresh_expires_at: refreshExpiresAt,
  };

  const { error } = await opts.admin
    .from("org_integrations")
    .upsert(
      {
        org_id: opts.orgId,
        provider: "ebay",
        credentials: encrypted,
        metadata,
        connected_at: now.toISOString(),
        last_used_at: now.toISOString(),
      },
      { onConflict: "org_id,provider" },
    );

  if (error) {
    console.error("org_integrations upsert failed", error);
    return { ok: false, message: "Could not save eBay connection." };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const params = url.searchParams;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("EBAY_CLIENT_ID");
  const clientSecret = Deno.env.get("EBAY_CLIENT_SECRET");
  const ruName = Deno.env.get("EBAY_RUNAME");
  const env = (Deno.env.get("EBAY_OAUTH_ENV") ?? "production") as EbayEnv;
  const defaultScheme = Deno.env.get("EBAY_OAUTH_RETURN_SCHEME") ?? "nexissue";
  const encryptionKey = Deno.env.get("OAUTH_TOKEN_ENCRYPTION_KEY");

  if (
    !supabaseUrl || !serviceRoleKey || !clientId || !clientSecret || !ruName ||
    !encryptionKey
  ) {
    console.error("ebay-oauth-callback: missing required env");
    return htmlError(
      "Server is not configured for eBay OAuth. Contact the administrator.",
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // eBay sends `error` / `error_description` when the user declines.
  const ebayError = params.get("error");
  const state = params.get("state");
  if (ebayError) {
    const description = params.get("error_description") ??
      "eBay denied the authorization request.";
    if (state) {
      const stateLookup = await admin
        .from("oauth_states")
        .select("return_scheme")
        .eq("state", state)
        .maybeSingle<{ return_scheme: string | null }>();
      const scheme = stateLookup.data?.return_scheme ?? defaultScheme;
      return redirectToApp({
        scheme,
        status: "error",
        errorCode: "ebay_denied",
        errorMessage: description,
      });
    }
    return htmlError(description);
  }

  const code = params.get("code");
  if (!code || !state) {
    return htmlError(
      "Missing `code` or `state` parameter from eBay. Try connecting again.",
    );
  }

  const consumed = await consumeState(admin, state);
  if (!consumed.ok) {
    return redirectToApp({
      scheme: defaultScheme,
      status: "error",
      errorCode: consumed.code,
      errorMessage: consumed.message,
    });
  }
  const scheme = consumed.row.return_scheme ?? defaultScheme;
  if (consumed.row.provider !== "ebay") {
    return redirectToApp({
      scheme,
      status: "error",
      errorCode: "invalid_state",
      errorMessage: "OAuth state is not for the eBay provider.",
    });
  }

  let tokens: EbayTokenResponse;
  try {
    tokens = await exchangeCodeForTokens({
      env,
      clientId,
      clientSecret,
      ruName,
      code,
    });
  } catch (err) {
    console.error("token exchange failed", err);
    return redirectToApp({
      scheme,
      status: "error",
      errorCode: "token_exchange_failed",
      errorMessage: err instanceof Error
        ? err.message
        : "eBay token exchange failed.",
    });
  }

  const userInfo = await fetchEbayUser({
    env,
    accessToken: tokens.access_token,
  }).catch((err) => {
    console.warn("ebay identity fetch failed (non-fatal)", err);
    return { username: null, accountType: null, registrationMarketplaceId: null };
  });

  const persisted = await persistIntegration({
    admin,
    orgId: consumed.row.org_id,
    tokens,
    username: userInfo.username,
    scopes: Deno.env.get("EBAY_OAUTH_SCOPES") ?? "",
    env,
    encryptionKey,
  });

  if (!persisted.ok) {
    return redirectToApp({
      scheme,
      status: "error",
      errorCode: "persist_failed",
      errorMessage: persisted.message,
    });
  }

  return redirectToApp({
    scheme,
    status: "success",
    account: userInfo.username,
    environment: env,
  });
});
