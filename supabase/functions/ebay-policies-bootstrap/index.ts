/**
 * ebay-policies-bootstrap — ensure eBay business policies exist for listing.
 *
 * Checks stored metadata, then existing eBay account policies, then creates
 * NexIssue defaults for sandbox / new sellers.
 *
 * Deploy:
 *   supabase functions deploy ebay-policies-bootstrap
 */

import { createClient } from "npm:@supabase/supabase-js@2";

import { CORS_HEADERS, jsonResponse } from "../_shared/cors.ts";
import {
  bootstrapEbayPolicies,
  getValidEbayAccessToken,
  optInToSellingPolicyManagement,
} from "../_shared/ebay-sell.ts";
import type { EncryptedBlob } from "../_shared/encryption.ts";

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
      { error: "server_misconfigured", message: "Policy bootstrap is not configured." },
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
      credentials: EncryptedBlob;
      metadata: Record<string, unknown> | null;
    }>();

  if (integrationError) {
    console.error("ebay-policies-bootstrap: integration lookup failed", integrationError);
    return jsonResponse(
      { error: "server_error", message: "Could not load eBay connection." },
      500,
    );
  }
  if (!integration?.credentials) {
    return jsonResponse(
      {
        error: "ebay_not_connected",
        message: "Connect eBay in Settings → Integrations first.",
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
    console.error("ebay-policies-bootstrap: token refresh failed", err);
    return jsonResponse(
      {
        error: "ebay_auth_failed",
        message: "eBay session expired. Reconnect eBay in Settings → Integrations.",
      },
      502,
    );
  }

  try {
    await optInToSellingPolicyManagement({
      env,
      accessToken,
    });

    const result = await bootstrapEbayPolicies({
      env,
      accessToken,
      existingMetadata: integration.metadata,
    });

    const now = new Date().toISOString();
    const metadata = {
      ...(integration.metadata ?? {}),
      ...result.policies,
      policiesBootstrappedAt: result.created ? now : (
        integration.metadata?.policiesBootstrappedAt ?? now
      ),
    };

    const { error: updateError } = await admin
      .from("org_integrations")
      .update({ metadata, last_used_at: now })
      .eq("org_id", orgId)
      .eq("provider", "ebay");

    if (updateError) {
      console.error("ebay-policies-bootstrap: metadata update failed", updateError);
      return jsonResponse(
        { error: "persist_failed", message: "Policies were created but could not be saved." },
        500,
      );
    }

    return jsonResponse({
      ...result.policies,
      created: result.created,
      environment: env,
      message: result.created
        ? "Default policies created — you can customize in eBay Seller Hub."
        : "Using your existing eBay business policies.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Policy bootstrap failed.";
    console.error("ebay-policies-bootstrap: failed", err);
    return jsonResponse(
      { error: "policy_bootstrap_failed", message },
      502,
    );
  }
});
