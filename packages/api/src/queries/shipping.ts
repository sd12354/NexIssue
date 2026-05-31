import type { Json, Tables } from "types";

import type { NexIssueSupabaseClient } from "../client";

export type ShippingFromAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
};

export type ShippingPreset = Tables<"org_shipping_presets">;

export type ShippingPresetInput = {
  name: string;
  length: number;
  width: number;
  height: number;
  weight: number;
  distanceUnit?: string;
  massUnit?: string;
  isDefault?: boolean;
};

function parseShippingFrom(raw: Json | null): ShippingFromAddress | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const street1 = typeof obj.street1 === "string" ? obj.street1.trim() : "";
  const city = typeof obj.city === "string" ? obj.city.trim() : "";
  const state = typeof obj.state === "string" ? obj.state.trim() : "";
  const zip = typeof obj.zip === "string" ? obj.zip.trim() : "";
  if (!name || !street1 || !city || !state || !zip) return null;

  return {
    name,
    street1,
    street2: typeof obj.street2 === "string" ? obj.street2.trim() : undefined,
    city,
    state,
    zip,
    country: typeof obj.country === "string" && obj.country.trim()
      ? obj.country.trim()
      : "US",
    phone: typeof obj.phone === "string" ? obj.phone.trim() : undefined,
  };
}

export function formatPresetDimensions(preset: ShippingPreset): string {
  return `${preset.length} × ${preset.width} × ${preset.height} ${preset.distance_unit} · ${preset.weight} ${preset.mass_unit}`;
}

export async function getShippingFrom(
  client: NexIssueSupabaseClient,
  orgId: string,
): Promise<ShippingFromAddress | null> {
  const { data, error } = await client
    .from("organizations")
    .select("shipping_from")
    .eq("id", orgId)
    .maybeSingle();

  if (error) throw error;
  return parseShippingFrom(data?.shipping_from ?? null);
}

export async function updateShippingFrom(
  client: NexIssueSupabaseClient,
  orgId: string,
  address: ShippingFromAddress,
): Promise<void> {
  const { error } = await client
    .from("organizations")
    .update({ shipping_from: address as unknown as Json })
    .eq("id", orgId);

  if (error) throw error;
}

export async function listShippingPresets(
  client: NexIssueSupabaseClient,
  orgId: string,
): Promise<ShippingPreset[]> {
  const { data, error } = await client
    .from("org_shipping_presets")
    .select("*")
    .eq("org_id", orgId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ShippingPreset[];
}

export async function createShippingPreset(
  client: NexIssueSupabaseClient,
  orgId: string,
  input: ShippingPresetInput,
): Promise<ShippingPreset> {
  if (input.isDefault) {
    await client
      .from("org_shipping_presets")
      .update({ is_default: false })
      .eq("org_id", orgId);
  }

  const { data, error } = await client
    .from("org_shipping_presets")
    .insert({
      org_id: orgId,
      name: input.name.trim(),
      length: input.length,
      width: input.width,
      height: input.height,
      weight: input.weight,
      distance_unit: input.distanceUnit ?? "in",
      mass_unit: input.massUnit ?? "oz",
      is_default: input.isDefault ?? false,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ShippingPreset;
}

export async function updateShippingPreset(
  client: NexIssueSupabaseClient,
  orgId: string,
  presetId: string,
  input: Partial<ShippingPresetInput>,
): Promise<ShippingPreset> {
  if (input.isDefault) {
    await client
      .from("org_shipping_presets")
      .update({ is_default: false })
      .eq("org_id", orgId);
  }

  const patch: Partial<{
    name: string;
    length: number;
    width: number;
    height: number;
    weight: number;
    distance_unit: string;
    mass_unit: string;
    is_default: boolean;
  }> = {};
  if (input.name != null) patch.name = input.name.trim();
  if (input.length != null) patch.length = input.length;
  if (input.width != null) patch.width = input.width;
  if (input.height != null) patch.height = input.height;
  if (input.weight != null) patch.weight = input.weight;
  if (input.distanceUnit != null) patch.distance_unit = input.distanceUnit;
  if (input.massUnit != null) patch.mass_unit = input.massUnit;
  if (input.isDefault != null) patch.is_default = input.isDefault;

  const { data, error } = await client
    .from("org_shipping_presets")
    .update(patch)
    .eq("org_id", orgId)
    .eq("id", presetId)
    .select("*")
    .single();

  if (error) throw error;
  return data as ShippingPreset;
}

export async function deleteShippingPreset(
  client: NexIssueSupabaseClient,
  orgId: string,
  presetId: string,
): Promise<void> {
  const { error } = await client
    .from("org_shipping_presets")
    .delete()
    .eq("org_id", orgId)
    .eq("id", presetId);

  if (error) throw error;
}

export async function setDefaultShippingPreset(
  client: NexIssueSupabaseClient,
  orgId: string,
  presetId: string,
): Promise<void> {
  await client
    .from("org_shipping_presets")
    .update({ is_default: false })
    .eq("org_id", orgId);

  const { error } = await client
    .from("org_shipping_presets")
    .update({ is_default: true })
    .eq("org_id", orgId)
    .eq("id", presetId);

  if (error) throw error;
}

export async function registerPushToken(
  client: NexIssueSupabaseClient,
  input: {
    userId: string;
    orgId: string;
    expoPushToken: string;
    platform?: string;
  },
): Promise<void> {
  const { error } = await client.from("push_tokens").upsert(
    {
      user_id: input.userId,
      org_id: input.orgId,
      expo_push_token: input.expoPushToken,
      platform: input.platform ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,expo_push_token" },
  );

  if (error) throw error;
}
