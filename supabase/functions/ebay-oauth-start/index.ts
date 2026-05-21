/**
 * ebay-oauth-start — issue an eBay OAuth authorize URL for the caller's org.
 *
 * Mobile flow:
 *   1. App calls this function with `Authorization: Bearer <session>`.
 *   2. We resolve the caller's user + their first org membership (PRD: single
 *      org per user during personal-use phase).
 *   3. We generate a random `state`, persist it in `oauth_states` with the
 *      org/user pair, and return the eBay authorize URL.
 *   4. App opens the URL in `expo-web-browser.openAuthSessionAsync()`. eBay
 *      redirects to the `ebay-oauth-callback` function, which finishes the
 *      exchange and 302s back to the app's deep link.
 *
 * Required env (Supabase secrets):
 *   - EBAY_CLIENT_ID
 *   - EBAY_RUNAME              (the RuName configured in eBay dev dashboard)
 *   - EBAY_OAUTH_ENV           (`production` | `sandbox`, default production)
 *   - EBAY_OAUTH_SCOPES        (optional space-separated override)
 *   - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto)
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import { CORS_HEADERS, jsonResponse } from "../_shared/cors.ts";
import {
  buildAuthorizeUrl,
  EBAY_DEFAULT_SCOPES,
  ebayOAuthConfigHints,
  parseEbayOAuthConfig,
  validateEbayOAuthConfig,
} from "../_shared/ebay.ts";
import { generateState } from "../_shared/encryption.ts";

type StartRequest = {
  returnScheme?: string;
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
      {
        error: "unauthorized",
        message: "Missing or invalid Authorization header",
      },
      401,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("EBAY_CLIENT_ID");
  const ruName = Deno.env.get("EBAY_RUNAME");
  const ebayConfig = parseEbayOAuthConfig({
    clientId,
    ruName,
    env: Deno.env.get("EBAY_OAUTH_ENV"),
  });
  const scopeOverride = Deno.env.get("EBAY_OAUTH_SCOPES")?.trim();

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(
      { error: "server_error", message: "Supabase environment not configured" },
      500,
    );
  }

  const configError = validateEbayOAuthConfig(ebayConfig);
  if (configError) {
    console.error("ebay-oauth-start: invalid config", configError.code, ebayOAuthConfigHints(ebayConfig));
    return jsonResponse(
      {
        error: configError.code,
        message: configError.message,
        hints: ebayOAuthConfigHints(ebayConfig),
      },
      500,
    );
  }

  const { clientId: trimmedClientId, ruName: trimmedRuName, env } = ebayConfig;

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: { user }, error: authError } = await supabaseUser.auth
    .getUser();
  if (authError || !user) {
    return jsonResponse(
      { error: "unauthorized", message: "Invalid or expired session" },
      401,
    );
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("ebay-oauth-start: org lookup failed", membershipError);
    return jsonResponse(
      { error: "server_error", message: "Could not resolve organization" },
      500,
    );
  }
  if (!membership) {
    return jsonResponse(
      {
        error: "no_org",
        message: "User has no organization membership",
      },
      400,
    );
  }

  let body: StartRequest = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      body = (await req.json()) as StartRequest;
    }
  } catch {
    body = {};
  }

  const state = generateState();
  const returnScheme = typeof body.returnScheme === "string"
    ? body.returnScheme
    : null;

  const { error: stateError } = await supabaseAdmin.from("oauth_states")
    .insert({
      state,
      provider: "ebay",
      org_id: membership.org_id,
      user_id: user.id,
      return_scheme: returnScheme,
    });

  if (stateError) {
    console.error("ebay-oauth-start: state insert failed", stateError);
    return jsonResponse(
      { error: "server_error", message: "Could not initiate OAuth flow" },
      500,
    );
  }

  const scopes = scopeOverride
    ? scopeOverride.split(/\s+/).filter(Boolean)
    : EBAY_DEFAULT_SCOPES;

  const authorizeUrl = buildAuthorizeUrl({
    env,
    clientId: trimmedClientId,
    ruName: trimmedRuName,
    scopes,
    state,
    prompt: "login",
  });

  const hints = ebayOAuthConfigHints(ebayConfig);
  console.log("ebay-oauth-start: issuing authorize URL", hints);

  return jsonResponse({
    authorizeUrl,
    state,
    expiresInSeconds: 15 * 60,
    environment: env,
    hints,
  });
});
