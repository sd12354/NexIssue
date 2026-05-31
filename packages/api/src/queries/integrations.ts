import { FunctionsHttpError } from "@supabase/supabase-js";
import type { Json, Tables } from "types";

import type { NexIssueSupabaseClient } from "../client";

export type IntegrationProvider = "ebay" | "shippo" | "gocollect";

export type OrgIntegration = Omit<
  Tables<"org_integrations">,
  "credentials"
> & {
  metadata: IntegrationMetadata;
};

export type IntegrationVerification = {
  status: "ok" | "needs_reconnect" | "error";
  last_verified_at: string;
  account?: string | null;
  error_code?: string;
  error_message?: string;
};

export type IntegrationMetadata = {
  account?: string | null;
  environment?: "production" | "sandbox";
  test_mode?: boolean;
  scopes?: string[];
  access_expires_at?: string;
  refresh_expires_at?: string;
  fulfillmentPolicyId?: string;
  paymentPolicyId?: string;
  returnPolicyId?: string;
  policiesBootstrappedAt?: string;
  verification?: IntegrationVerification;
  [key: string]: unknown;
};

export type EbayPoliciesBootstrap = {
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  created: boolean;
  environment: "production" | "sandbox";
  message: string;
};

export type EbayOAuthStart = {
  authorizeUrl: string;
  state: string;
  environment: "production" | "sandbox";
  expiresInSeconds: number;
};

export class IntegrationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "IntegrationError";
  }
}

/**
 * Read all org_integrations for the given org. The `credentials` column is
 * intentionally not selected — the mobile client has no SELECT privilege on
 * that column. Display data lives in `metadata` instead.
 */
export async function listIntegrations(
  client: NexIssueSupabaseClient,
  orgId: string,
): Promise<OrgIntegration[]> {
  const { data, error } = await client
    .from("org_integrations")
    .select(
      "id, org_id, provider, metadata, connected_at, last_used_at, created_at, updated_at",
    )
    .eq("org_id", orgId);

  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    metadata: (row.metadata ?? {}) as IntegrationMetadata,
  })) as OrgIntegration[];
}

export async function getIntegration(
  client: NexIssueSupabaseClient,
  orgId: string,
  provider: IntegrationProvider,
): Promise<OrgIntegration | null> {
  const { data, error } = await client
    .from("org_integrations")
    .select(
      "id, org_id, provider, metadata, connected_at, last_used_at, created_at, updated_at",
    )
    .eq("org_id", orgId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    metadata: (data.metadata ?? {}) as IntegrationMetadata,
  } as OrgIntegration;
}

export async function disconnectIntegration(
  client: NexIssueSupabaseClient,
  orgId: string,
  provider: IntegrationProvider,
): Promise<void> {
  const { error } = await client
    .from("org_integrations")
    .delete()
    .eq("org_id", orgId)
    .eq("provider", provider);
  if (error) throw error;
}

async function parseFunctionError(
  error: FunctionsHttpError,
  fallbackCode: string,
): Promise<IntegrationError> {
  try {
    const body = (await error.context.json()) as {
      error?: string;
      message?: string;
    };
    if (body?.message) {
      return new IntegrationError(body.error ?? fallbackCode, body.message);
    }
  } catch {
    // ignore non-JSON body
  }
  const status = error.context?.status;
  return new IntegrationError(
    fallbackCode,
    error.message || `Request failed (HTTP ${status ?? "unknown"}).`,
  );
}

/**
 * Kick off an eBay OAuth flow by asking the `ebay-oauth-start` edge function
 * for an authorize URL bound to a fresh single-use state token.
 */
export async function startEbayOAuth(
  client: NexIssueSupabaseClient,
  options: { returnScheme?: string } = {},
): Promise<EbayOAuthStart> {
  const { data, error } = await client.functions.invoke("ebay-oauth-start", {
    body: { returnScheme: options.returnScheme },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw await parseFunctionError(error, "oauth_start_failed");
    }
    throw new IntegrationError(
      "network_error",
      error.message || "Could not reach eBay OAuth service.",
    );
  }

  const payload = data as Json | undefined;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new IntegrationError(
      "oauth_start_failed",
      "Empty response from ebay-oauth-start.",
    );
  }

  const obj = payload as Record<string, unknown>;
  const authorizeUrl = typeof obj.authorizeUrl === "string"
    ? obj.authorizeUrl
    : null;
  const state = typeof obj.state === "string" ? obj.state : null;
  const environment = obj.environment === "sandbox" ? "sandbox" : "production";
  const expiresInSeconds = typeof obj.expiresInSeconds === "number"
    ? obj.expiresInSeconds
    : 15 * 60;

  if (!authorizeUrl || !state) {
    throw new IntegrationError(
      "oauth_start_failed",
      "ebay-oauth-start did not return an authorize URL.",
    );
  }

  return { authorizeUrl, state, environment, expiresInSeconds };
}

/**
 * Ensure eBay business policies exist after OAuth connect.
 * Creates defaults in sandbox; reuses existing policies in production.
 */
export async function bootstrapEbayPolicies(
  client: NexIssueSupabaseClient,
): Promise<EbayPoliciesBootstrap> {
  const { data, error } = await client.functions.invoke(
    "ebay-policies-bootstrap",
    { body: {} },
  );

  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw await parseFunctionError(error, "policy_bootstrap_failed");
    }
    throw new IntegrationError(
      "network_error",
      error.message || "Could not reach eBay policy bootstrap service.",
    );
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") {
    throw new IntegrationError(
      "policy_bootstrap_failed",
      "Empty response from ebay-policies-bootstrap.",
    );
  }

  const fulfillmentPolicyId = typeof payload.fulfillmentPolicyId === "string"
    ? payload.fulfillmentPolicyId
    : null;
  const paymentPolicyId = typeof payload.paymentPolicyId === "string"
    ? payload.paymentPolicyId
    : null;
  const returnPolicyId = typeof payload.returnPolicyId === "string"
    ? payload.returnPolicyId
    : null;
  const message = typeof payload.message === "string"
    ? payload.message
    : "eBay policies ready.";

  if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
    throw new IntegrationError(
      "policy_bootstrap_failed",
      message,
    );
  }

  return {
    fulfillmentPolicyId,
    paymentPolicyId,
    returnPolicyId,
    created: payload.created === true,
    environment: payload.environment === "sandbox" ? "sandbox" : "production",
    message,
  };
}

export type ShippoConnectResult = {
  success: boolean;
  account: string;
  testMode: boolean;
};

/**
 * Store an org's Shippo API key via the shippo-connect edge function.
 */
export async function connectShippo(
  client: NexIssueSupabaseClient,
  apiKey: string,
): Promise<ShippoConnectResult> {
  const { data, error } = await client.functions.invoke("shippo-connect", {
    body: { apiKey: apiKey.trim() },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw await parseFunctionError(error, "shippo_connect_failed");
    }
    throw new IntegrationError(
      "network_error",
      error.message || "Could not reach Shippo connect service.",
    );
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.success !== true) {
    throw new IntegrationError(
      "shippo_connect_failed",
      typeof payload?.message === "string"
        ? payload.message
        : "Shippo connect failed.",
    );
  }

  return {
    success: true,
    account: typeof payload.account === "string" ? payload.account : "Shippo",
    testMode: payload.testMode === true,
  };
}

export type EbayVerificationResult =
  | {
      ok: true;
      account: string | null;
      environment: "production" | "sandbox";
      lastVerifiedAt: string;
    }
  | {
      ok: false;
      code: string;
      message: string;
      lastVerifiedAt?: string;
    };

/**
 * Confirm the org's stored eBay tokens still work by calling the
 * `ebay-verify-connection` edge function. Updates
 * `org_integrations.metadata.verification` server-side so subsequent reads
 * of `listIntegrations` reflect the result without a round-trip.
 */
export async function verifyEbayConnection(
  client: NexIssueSupabaseClient,
): Promise<EbayVerificationResult> {
  const { data, error } = await client.functions.invoke(
    "ebay-verify-connection",
    { body: {} },
  );

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const parsed = await parseFunctionError(error, "verify_failed");
      throw parsed;
    }
    throw new IntegrationError(
      "network_error",
      error.message || "Could not reach eBay verify service.",
    );
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") {
    throw new IntegrationError(
      "verify_failed",
      "Empty response from ebay-verify-connection.",
    );
  }

  if (payload.ok === true) {
    return {
      ok: true,
      account: typeof payload.account === "string" ? payload.account : null,
      environment: payload.environment === "sandbox" ? "sandbox" : "production",
      lastVerifiedAt: typeof payload.lastVerifiedAt === "string"
        ? payload.lastVerifiedAt
        : new Date().toISOString(),
    };
  }

  return {
    ok: false,
    code: typeof payload.code === "string" ? payload.code : "verify_failed",
    message: typeof payload.message === "string"
      ? payload.message
      : "eBay connection check failed.",
    lastVerifiedAt: typeof payload.lastVerifiedAt === "string"
      ? payload.lastVerifiedAt
      : undefined,
  };
}

export async function testShippoIntegration(
  client: NexIssueSupabaseClient,
): Promise<ShippoConnectResult> {
  const { data, error } = await client.functions.invoke("shippo-connect", {
    body: { testOnly: true },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw await parseFunctionError(error, "shippo_test_failed");
    }
    throw new IntegrationError(
      "network_error",
      error.message || "Could not reach Shippo connect service.",
    );
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload || payload.success !== true) {
    throw new IntegrationError(
      "shippo_test_failed",
      typeof payload?.message === "string"
        ? payload.message
        : "Shippo connection test failed.",
    );
  }

  return {
    success: true,
    account: typeof payload.account === "string" ? payload.account : "Shippo",
    testMode: payload.testMode === true,
  };
}
