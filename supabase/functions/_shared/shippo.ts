/**
 * Shippo REST API client (PRD §5.5, Phase 4).
 *
 * Auth: Authorization: ShippoToken {api_key}
 * Base: https://api.goshippo.com
 */

import { fetchWithTimeout } from "./fetch.ts";

const SHIPPO_BASE = "https://api.goshippo.com";
const REQUEST_TIMEOUT_MS = 30_000;

export type ShippoAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
};

export type ShippoParcel = {
  length: number;
  width: number;
  height: number;
  distance_unit: string;
  weight: number;
  mass_unit: string;
};

export type ShippoRate = {
  object_id: string;
  provider: string;
  servicelevel?: { token?: string; name?: string };
  amount: string;
  currency: string;
};

export type ShippoShipment = {
  object_id: string;
  rates: ShippoRate[];
};

export type ShippoTransaction = {
  object_id: string;
  status: string;
  tracking_number?: string;
  tracking_url_provider?: string;
  label_url?: string;
  rate?: ShippoRate;
  messages?: Array<{ text?: string }>;
};

export class ShippoError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = "ShippoError";
  }
}

export const DEFAULT_SLAB_PRESET: ShippoParcel = {
  length: 8,
  width: 6.5,
  height: 1.5,
  distance_unit: "in",
  weight: 12,
  mass_unit: "oz",
};

function parseShippoError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.__all__)) {
      return (parsed.__all__ as unknown[])
        .map((item) => typeof item === "string" ? item : JSON.stringify(item))
        .join("; ");
    }
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    // not JSON
  }
  return body.slice(0, 300) || `Shippo request failed (${status}).`;
}

export async function shippoRequest<T>(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetchWithTimeout(
    `${SHIPPO_BASE}${path}`,
    {
      method,
      headers: {
        Authorization: `ShippoToken ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    REQUEST_TIMEOUT_MS,
  );

  const text = await response.text();
  if (!response.ok) {
    throw new ShippoError(
      response.status === 401 ? "shippo_auth_failed" : "shippo_api_error",
      parseShippoError(response.status, text),
      response.status >= 500 ? 502 : response.status,
    );
  }

  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * Verify a Shippo API key by issuing a cheap GET to a real endpoint.
 *
 * Shippo does not expose a `/account` endpoint, so listing carrier accounts
 * (which every account has access to, even with zero configured carriers)
 * is the conventional way to test a key. We don't actually use the response
 * body; the caller derives the display label from the key's `shippo_test_`
 * / `shippo_live_` prefix.
 */
export async function testShippoAccount(apiKey: string): Promise<void> {
  await shippoRequest<unknown>(apiKey, "GET", "/carrier_accounts?results=1");
}

export function mapDbAddress(raw: Record<string, unknown>): ShippoAddress | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const street1 = typeof raw.street1 === "string" ? raw.street1.trim() : "";
  const city = typeof raw.city === "string" ? raw.city.trim() : "";
  const state = typeof raw.state === "string" ? raw.state.trim() : "";
  const zip = typeof raw.zip === "string" ? raw.zip.trim() : "";
  const country = typeof raw.country === "string" && raw.country.trim()
    ? raw.country.trim()
    : "US";

  if (!name || !street1 || !city || !state || !zip) return null;

  return {
    name,
    street1,
    street2: typeof raw.street2 === "string" ? raw.street2.trim() : undefined,
    city,
    state,
    zip,
    country,
    phone: typeof raw.phone === "string" ? raw.phone.trim() : undefined,
  };
}

export function pickShippoRate(rates: ShippoRate[]): ShippoRate | null {
  if (!rates.length) return null;

  const priorityUsps = rates
    .filter((rate) =>
      rate.provider?.toUpperCase() === "USPS" &&
      (rate.servicelevel?.token?.toLowerCase().includes("priority") ?? false)
    )
    .sort((a, b) => Number(a.amount) - Number(b.amount));

  if (priorityUsps.length > 0) return priorityUsps[0];

  return [...rates].sort((a, b) => Number(a.amount) - Number(b.amount))[0];
}

export async function createShippoShipment(
  apiKey: string,
  input: {
    addressFrom: ShippoAddress;
    addressTo: ShippoAddress;
    parcel: ShippoParcel;
  },
): Promise<ShippoShipment> {
  return await shippoRequest<ShippoShipment>(apiKey, "POST", "/shipments", {
    address_from: input.addressFrom,
    address_to: input.addressTo,
    parcels: [input.parcel],
    async: false,
  });
}

export async function purchaseShippoLabel(
  apiKey: string,
  rateObjectId: string,
): Promise<ShippoTransaction> {
  return await shippoRequest<ShippoTransaction>(apiKey, "POST", "/transactions", {
    rate: rateObjectId,
    label_file_type: "PDF",
    async: false,
  });
}
