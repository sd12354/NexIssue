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

export type IntegrationMetadata = {
  account?: string | null;
  environment?: "production" | "sandbox";
  scopes?: string[];
  access_expires_at?: string;
  refresh_expires_at?: string;
  [key: string]: unknown;
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
