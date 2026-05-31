import type { ShippingFromAddress } from "@app/api";
import { getShippingFrom, updateShippingFrom } from "@app/api";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppIcon } from "../components/AppIcon";
import { Screen } from "../components/Screen";
import { useCatalog } from "../contexts/CatalogContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

type ShippingAddressScreenProps = {
  onBack: () => void;
  onOpenPresets: () => void;
};

const emptyForm = (): ShippingFromAddress => ({
  name: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
  phone: "",
});

export function ShippingAddressScreen({
  onBack,
  onOpenPresets,
}: ShippingAddressScreenProps) {
  const { orgId } = useCatalog();
  const [form, setForm] = useState<ShippingFromAddress>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      setLoading(true);
      try {
        const existing = await getShippingFrom(supabase, orgId);
        if (existing) setForm({ ...emptyForm(), ...existing });
      } finally {
        setLoading(false);
      }
    })();
  }, [orgId]);

  const updateField = useCallback(
    (key: keyof ShippingFromAddress, value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!orgId) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateShippingFrom(supabase, orgId, form);
      setMessage("Shipping address saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save address.");
    } finally {
      setSaving(false);
    }
  }, [form, orgId]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <AppIcon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>Shipping</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          onPress={onOpenPresets}
          style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
        >
          <Text style={styles.linkTitle}>Package presets</Text>
          <AppIcon name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <Text style={styles.sectionLabel}>Ship-from address</Text>
        <Text style={styles.hint}>
          Used when generating Shippo labels for sold comics.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : (
          <>
            {(
              [
                ["name", "Name"],
                ["street1", "Street"],
                ["street2", "Street 2 (optional)"],
                ["city", "City"],
                ["state", "State"],
                ["zip", "ZIP"],
                ["country", "Country"],
                ["phone", "Phone"],
              ] as const
            ).map(([key, label]) => (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  value={form[key] ?? ""}
                  onChangeText={(value) => updateField(key, value)}
                  style={styles.input}
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize={key === "state" ? "characters" : "words"}
                />
              </View>
            ))}

            <Pressable
              disabled={saving}
              onPress={() => void handleSave()}
              style={({ pressed }) => [
                styles.saveButton,
                pressed && styles.pressed,
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.saveLabel}>Save address</Text>
              )}
            </Pressable>

            {message ? <Text style={styles.message}>{message}</Text> : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingTop: 4,
  },
  heading: { color: colors.text, fontSize: 26, fontWeight: "800" },
  scroll: { paddingBottom: 32, paddingTop: 12 },
  linkRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    padding: 14,
  },
  linkTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: 16, marginTop: 4 },
  field: { gap: 6, marginBottom: 12 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    marginTop: 8,
    paddingVertical: 14,
  },
  saveLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
  message: { color: colors.textMuted, fontSize: 13, marginTop: 12 },
  pressed: { opacity: 0.75 },
});
