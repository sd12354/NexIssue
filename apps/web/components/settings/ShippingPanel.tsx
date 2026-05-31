"use client";

import {
  createShippingPreset,
  deleteShippingPreset,
  formatPresetDimensions,
  getShippingFrom,
  listShippingPresets,
  updateShippingFrom,
  updateShippingPreset,
  type ShippingFromAddress,
  type ShippingPreset,
} from "@app/api";
import { useCallback, useEffect, useState } from "react";

import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { useCatalog } from "../../contexts/CatalogProvider";
import { getSupabase } from "../../lib/supabase";

const emptyAddress = (): ShippingFromAddress => ({
  name: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
  phone: "",
});

export function ShippingPanel() {
  const { orgId } = useCatalog();
  const [address, setAddress] = useState<ShippingFromAddress>(emptyAddress());
  const [presets, setPresets] = useState<ShippingPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingPreset, setEditingPreset] = useState<ShippingPreset | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: "",
    length: "8",
    width: "6.5",
    height: "1.5",
    weight: "12",
    isDefault: false,
  });

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [from, rows] = await Promise.all([
        getShippingFrom(getSupabase(), orgId),
        listShippingPresets(getSupabase(), orgId),
      ]);
      if (from) setAddress({ ...emptyAddress(), ...from });
      setPresets(rows);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveAddress = async () => {
    if (!orgId) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateShippingFrom(getSupabase(), orgId, address);
      setMessage("Shipping address saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save address.");
    } finally {
      setSaving(false);
    }
  };

  const savePreset = async () => {
    if (!orgId) return;
    const length = Number(presetForm.length);
    const width = Number(presetForm.width);
    const height = Number(presetForm.height);
    const weight = Number(presetForm.weight);
    if (!presetForm.name.trim()) return;

    setSaving(true);
    try {
      if (editingPreset) {
        await updateShippingPreset(getSupabase(), orgId, editingPreset.id, {
          name: presetForm.name,
          length,
          width,
          height,
          weight,
          isDefault: presetForm.isDefault,
        });
      } else {
        await createShippingPreset(getSupabase(), orgId, {
          name: presetForm.name,
          length,
          width,
          height,
          weight,
          isDefault: presetForm.isDefault,
        });
      }
      setEditingPreset(null);
      setPresetForm({
        name: "",
        length: "8",
        width: "6.5",
        height: "1.5",
        weight: "12",
        isDefault: false,
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted">Loading shipping settings…</p>;
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="font-semibold text-foreground">Ship-from address</h3>
        <p className="mt-1 text-sm text-muted">
          Used when generating Shippo labels for sold comics.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["name", "Name"],
              ["street1", "Street"],
              ["street2", "Street 2"],
              ["city", "City"],
              ["state", "State"],
              ["zip", "ZIP"],
              ["country", "Country"],
              ["phone", "Phone"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="text-muted">{label}</span>
              <input
                className="mt-1 w-full rounded-lg border border-surface-border bg-input px-3 py-2 text-foreground"
                value={address[key] ?? ""}
                onChange={(event) =>
                  setAddress((prev) => ({ ...prev, [key]: event.target.value }))}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button disabled={saving} onClick={() => void saveAddress()}>
            Save address
          </Button>
          {message ? <span className="text-sm text-muted">{message}</span> : null}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold text-foreground">Package presets</h3>
        <ul className="mt-4 space-y-2">
          {presets.map((preset) => (
            <li
              key={preset.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border px-3 py-2"
            >
              <div>
                <p className="font-medium text-foreground">{preset.name}</p>
                <p className="font-mono text-xs text-muted">
                  {formatPresetDimensions(preset)}
                </p>
              </div>
              <div className="flex gap-2">
                {preset.is_default ? (
                  <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent">
                    Default
                  </span>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingPreset(preset);
                    setPresetForm({
                      name: preset.name,
                      length: String(preset.length),
                      width: String(preset.width),
                      height: String(preset.height),
                      weight: String(preset.weight),
                      isDefault: preset.is_default,
                    });
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void deleteShippingPreset(getSupabase(), orgId!, preset.id)
                      .then(refresh)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className="rounded-lg border border-surface-border bg-input px-3 py-2"
            placeholder="Preset name"
            value={presetForm.name}
            onChange={(event) =>
              setPresetForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          {(["length", "width", "height", "weight"] as const).map((field) => (
            <input
              key={field}
              className="rounded-lg border border-surface-border bg-input px-3 py-2"
              placeholder={field}
              value={presetForm[field]}
              onChange={(event) =>
                setPresetForm((prev) => ({ ...prev, [field]: event.target.value }))}
            />
          ))}
          <label className="flex items-center gap-2 text-sm text-muted sm:col-span-2">
            <input
              type="checkbox"
              checked={presetForm.isDefault}
              onChange={(event) =>
                setPresetForm((prev) => ({
                  ...prev,
                  isDefault: event.target.checked,
                }))}
            />
            Set as default
          </label>
        </div>
        <Button className="mt-3" disabled={saving} onClick={() => void savePreset()}>
          {editingPreset ? "Update preset" : "Add preset"}
        </Button>
      </Card>
    </div>
  );
}
