import {
  createShippingPreset,
  deleteShippingPreset,
  formatPresetDimensions,
  listShippingPresets,
  setDefaultShippingPreset,
  updateShippingPreset,
  type ShippingPreset,
} from "@app/api";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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

type ShippingPresetsScreenProps = {
  onBack: () => void;
};

type PresetForm = {
  name: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  isDefault: boolean;
};

const emptyForm = (): PresetForm => ({
  name: "",
  length: "8",
  width: "6.5",
  height: "1.5",
  weight: "12",
  isDefault: false,
});

export function ShippingPresetsScreen({ onBack }: ShippingPresetsScreenProps) {
  const { orgId } = useCatalog();
  const [presets, setPresets] = useState<ShippingPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShippingPreset | null>(null);
  const [form, setForm] = useState<PresetForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      setPresets(await listShippingPresets(supabase, orgId));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (preset: ShippingPreset) => {
    setEditing(preset);
    setForm({
      name: preset.name,
      length: String(preset.length),
      width: String(preset.width),
      height: String(preset.height),
      weight: String(preset.weight),
      isDefault: preset.is_default,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!orgId) return;
    const length = Number(form.length);
    const width = Number(form.width);
    const height = Number(form.height);
    const weight = Number(form.weight);
    if (!form.name.trim() || !Number.isFinite(length) || !Number.isFinite(width) ||
      !Number.isFinite(height) || !Number.isFinite(weight)) {
      Alert.alert("Invalid preset", "Fill in all fields with valid numbers.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await updateShippingPreset(supabase, orgId, editing.id, {
          name: form.name,
          length,
          width,
          height,
          weight,
          isDefault: form.isDefault,
        });
      } else {
        await createShippingPreset(supabase, orgId, {
          name: form.name,
          length,
          width,
          height,
          weight,
          isDefault: form.isDefault,
        });
      }
      setModalOpen(false);
      await refresh();
    } catch (err) {
      Alert.alert(
        "Could not save",
        err instanceof Error ? err.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (preset: ShippingPreset) => {
    if (!orgId) return;
    Alert.alert("Delete preset", `Remove "${preset.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteShippingPreset(supabase, orgId, preset.id);
            await refresh();
          } catch (err) {
            Alert.alert(
              "Could not delete",
              err instanceof Error ? err.message : "Try again.",
            );
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <AppIcon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>Shipping presets</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {presets.map((preset) => (
            <Pressable
              key={preset.id}
              onPress={() => openEdit(preset)}
              onLongPress={() => handleDelete(preset)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{preset.name}</Text>
                <Text style={styles.rowMeta}>
                  {formatPresetDimensions(preset)}
                </Text>
              </View>
              {preset.is_default ? (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>Default</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Pressable
        onPress={openCreate}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      >
        <AppIcon name="add" size={24} color={colors.text} />
      </Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editing ? "Edit preset" : "Add preset"}
            </Text>
            {(
              [
                ["name", "Name"],
                ["length", "Length (in)"],
                ["width", "Width (in)"],
                ["height", "Height (in)"],
                ["weight", "Weight (oz)"],
              ] as const
            ).map(([key, label]) => (
              <View key={key} style={styles.field}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  value={form[key]}
                  onChangeText={(value) =>
                    setForm((prev) => ({ ...prev, [key]: value }))}
                  keyboardType={key === "name" ? "default" : "decimal-pad"}
                  style={styles.input}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            ))}

            <Pressable
              onPress={() =>
                setForm((prev) => ({ ...prev, isDefault: !prev.isDefault }))}
              style={styles.checkboxRow}
            >
              <AppIcon
                name={form.isDefault ? "checkbox" : "square-outline"}
                size={20}
                color={colors.accent}
              />
              <Text style={styles.checkboxLabel}>Set as default</Text>
            </Pressable>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setModalOpen(false)}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={saving}
                onPress={() => void handleSave()}
                style={styles.modalSave}
              >
                {saving ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  heading: { color: colors.text, fontSize: 22, fontWeight: "800" },
  scroll: { paddingBottom: 80, paddingTop: 12 },
  row: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 14,
  },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  rowMeta: {
    color: colors.textMuted,
    fontFamily: "Menlo",
    fontSize: 12,
  },
  defaultBadge: {
    backgroundColor: "rgba(124, 92, 255, 0.2)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  defaultBadgeText: { color: colors.accent, fontSize: 11, fontWeight: "700" },
  fab: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 28,
    bottom: 24,
    height: 56,
    justifyContent: "center",
    position: "absolute",
    right: 20,
    width: 56,
  },
  modalBackdrop: {
    backgroundColor: "rgba(0,0,0,0.6)",
    flex: 1,
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 12 },
  field: { gap: 4, marginBottom: 10 },
  label: { color: colors.textMuted, fontSize: 12 },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  checkboxRow: { alignItems: "center", flexDirection: "row", gap: 8, marginVertical: 8 },
  checkboxLabel: { color: colors.text, fontSize: 14 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 12 },
  modalCancel: {
    alignItems: "center",
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  modalCancelText: { color: colors.textMuted, fontWeight: "600" },
  modalSave: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    flex: 1,
    paddingVertical: 12,
  },
  modalSaveText: { color: colors.text, fontWeight: "700" },
  pressed: { opacity: 0.75 },
});
