/**
 * eBay Sell Inventory API helpers for listing-create.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  type EbayEnv,
  type EbayTokenResponse,
  ebayUrls,
} from "./ebay.ts";
import { decryptJson, encryptJson, type EncryptedBlob } from "./encryption.ts";

export type EbayStoredCredentials = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  access_expires_at: string;
  refresh_expires_at: string;
  scopes: string;
  environment: EbayEnv;
};

export type ListingPolicies = {
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
};

function sellApiBase(env: EbayEnv): string {
  return env === "sandbox"
    ? "https://api.sandbox.ebay.com"
    : "https://api.ebay.com";
}

function listingSiteBase(env: EbayEnv): string {
  return env === "sandbox"
    ? "https://www.sandbox.ebay.com"
    : "https://www.ebay.com";
}

export function buildListingUrl(env: EbayEnv, listingId: string): string {
  return `${listingSiteBase(env)}/itm/${listingId}`;
}

async function ebaySellRequest<T>(
  path: string,
  opts: {
    env: EbayEnv;
    accessToken: string;
    method?: string;
    body?: unknown;
  },
): Promise<T> {
  const response = await fetch(`${sellApiBase(opts.env)}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Content-Language": "en-US",
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `eBay Sell API ${opts.method ?? "GET"} ${path} failed (${response.status}): ${text.slice(0, 600)}`,
    );
  }

  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export async function refreshAccessToken(opts: {
  env: EbayEnv;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  scopes: string;
}): Promise<EbayTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    scope: opts.scopes,
  });
  const basic = btoa(`${opts.clientId}:${opts.clientSecret}`);
  const response = await fetch(ebayUrls(opts.env).token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `eBay token refresh failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }
  return (await response.json()) as EbayTokenResponse;
}

function isExpired(iso: string, skewMs = 5 * 60 * 1000): boolean {
  const expires = Date.parse(iso);
  if (Number.isNaN(expires)) return true;
  return Date.now() + skewMs >= expires;
}

export async function getValidEbayAccessToken(opts: {
  admin: SupabaseClient;
  orgId: string;
  encrypted: EncryptedBlob;
  encryptionKey: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ accessToken: string; env: EbayEnv }> {
  const creds = await decryptJson<EbayStoredCredentials>(
    opts.encrypted,
    opts.encryptionKey,
  );
  const env = creds.environment ?? "production";

  if (!isExpired(creds.access_expires_at)) {
    return { accessToken: creds.access_token, env };
  }

  const tokens = await refreshAccessToken({
    env,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    refreshToken: creds.refresh_token,
    scopes: creds.scopes,
  });

  const now = new Date();
  const accessExpiresAt = new Date(
    now.getTime() + tokens.expires_in * 1000,
  ).toISOString();
  const refreshExpiresAt = new Date(
    now.getTime() + tokens.refresh_token_expires_in * 1000,
  ).toISOString();

  const updated: EbayStoredCredentials = {
    ...creds,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
    access_expires_at: accessExpiresAt,
    refresh_expires_at: refreshExpiresAt,
  };

  const encrypted = await encryptJson(updated, opts.encryptionKey);
  const metadata = {
    account: null as string | null,
    environment: env,
    scopes: creds.scopes.split(/\s+/).filter(Boolean),
    access_expires_at: accessExpiresAt,
    refresh_expires_at: refreshExpiresAt,
  };

  const { data: existing } = await opts.admin
    .from("org_integrations")
    .select("metadata")
    .eq("org_id", opts.orgId)
    .eq("provider", "ebay")
    .maybeSingle<{ metadata: Record<string, unknown> | null }>();

  if (existing?.metadata && typeof existing.metadata.account === "string") {
    metadata.account = existing.metadata.account;
  }

  const { error } = await opts.admin
    .from("org_integrations")
    .update({
      credentials: encrypted,
      metadata,
      last_used_at: now.toISOString(),
    })
    .eq("org_id", opts.orgId)
    .eq("provider", "ebay");

  if (error) {
    console.warn("listing-create: failed to persist refreshed tokens", error);
  }

  return { accessToken: tokens.access_token, env };
}

export async function resolveListingPolicies(opts: {
  env: EbayEnv;
  accessToken: string;
  fulfillmentPolicyId?: string | null;
  paymentPolicyId?: string | null;
  returnPolicyId?: string | null;
}): Promise<ListingPolicies> {
  const marketplace = "marketplace_id=EBAY_US";

  async function firstPolicyId(
    path: string,
    key: "fulfillmentPolicies" | "paymentPolicies" | "returnPolicies",
    idKey: "fulfillmentPolicyId" | "paymentPolicyId" | "returnPolicyId",
  ): Promise<string | null> {
    const data = await ebaySellRequest<Record<string, unknown>>(
      `${path}?${marketplace}`,
      { env: opts.env, accessToken: opts.accessToken },
    );
    const list = data[key];
    if (!Array.isArray(list) || list.length === 0) return null;
    const first = list[0] as Record<string, unknown>;
    const id = first[idKey];
    return typeof id === "string" ? id : null;
  }

  const fulfillmentPolicyId = opts.fulfillmentPolicyId?.trim() ||
    (await firstPolicyId(
      "/sell/account/v1/fulfillment_policy",
      "fulfillmentPolicies",
      "fulfillmentPolicyId",
    ));
  const paymentPolicyId = opts.paymentPolicyId?.trim() ||
    (await firstPolicyId(
      "/sell/account/v1/payment_policy",
      "paymentPolicies",
      "paymentPolicyId",
    ));
  const returnPolicyId = opts.returnPolicyId?.trim() ||
    (await firstPolicyId(
      "/sell/account/v1/return_policy",
      "returnPolicies",
      "returnPolicyId",
    ));

  if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
    throw new Error(
      "Missing eBay business policies. Create shipping, payment, and return policies in your eBay seller account, or set EBAY_FULFILLMENT_POLICY_ID, EBAY_PAYMENT_POLICY_ID, and EBAY_RETURN_POLICY_ID secrets.",
    );
  }

  return { fulfillmentPolicyId, paymentPolicyId, returnPolicyId };
}

export async function resolveMerchantLocationKey(opts: {
  env: EbayEnv;
  accessToken: string;
  preferredKey?: string | null;
}): Promise<string> {
  if (opts.preferredKey?.trim()) return opts.preferredKey.trim();

  const data = await ebaySellRequest<{
    locations?: Array<{ merchantLocationKey?: string }>;
  }>("/sell/inventory/v1/location?limit=1", {
    env: opts.env,
    accessToken: opts.accessToken,
  });

  const key = data.locations?.[0]?.merchantLocationKey;
  if (key) return key;

  throw new Error(
    "No eBay merchant location found. Add an inventory location in eBay Seller Hub, or set EBAY_MERCHANT_LOCATION_KEY.",
  );
}

export async function upsertInventoryItem(opts: {
  env: EbayEnv;
  accessToken: string;
  sku: string;
  title: string;
  description: string;
  imageUrls: string[];
  aspects: Record<string, string[]>;
}): Promise<void> {
  await ebaySellRequest(
    `/sell/inventory/v1/inventory_item/${encodeURIComponent(opts.sku)}`,
    {
      env: opts.env,
      accessToken: opts.accessToken,
      method: "PUT",
      body: {
        availability: {
          shipToLocationAvailability: { quantity: 1 },
        },
        condition: "LIKE_NEW",
        product: {
          title: opts.title,
          description: opts.description,
          imageUrls: opts.imageUrls,
          aspects: opts.aspects,
        },
      },
    },
  );
}

export async function createOffer(opts: {
  env: EbayEnv;
  accessToken: string;
  sku: string;
  categoryId: string;
  description: string;
  price: number;
  policies: ListingPolicies;
  merchantLocationKey: string;
}): Promise<string> {
  const data = await ebaySellRequest<{ offerId?: string }>(
    "/sell/inventory/v1/offer",
    {
      env: opts.env,
      accessToken: opts.accessToken,
      method: "POST",
      body: {
        sku: opts.sku,
        marketplaceId: "EBAY_US",
        format: "FIXED_PRICE",
        availableQuantity: 1,
        categoryId: opts.categoryId,
        listingDescription: opts.description,
        merchantLocationKey: opts.merchantLocationKey,
        pricingSummary: {
          price: {
            currency: "USD",
            value: opts.price.toFixed(2),
          },
        },
        listingPolicies: {
          fulfillmentPolicyId: opts.policies.fulfillmentPolicyId,
          paymentPolicyId: opts.policies.paymentPolicyId,
          returnPolicyId: opts.policies.returnPolicyId,
        },
      },
    },
  );

  if (!data.offerId) {
    throw new Error("eBay did not return an offer ID.");
  }
  return data.offerId;
}

export async function publishOffer(opts: {
  env: EbayEnv;
  accessToken: string;
  offerId: string;
}): Promise<string> {
  const data = await ebaySellRequest<{ listingId?: string }>(
    `/sell/inventory/v1/offer/${encodeURIComponent(opts.offerId)}/publish`,
    {
      env: opts.env,
      accessToken: opts.accessToken,
      method: "POST",
      body: {},
    },
  );

  if (!data.listingId) {
    throw new Error("eBay did not return a listing ID after publish.");
  }
  return data.listingId;
}
