import { updateComic, type Comic, type ComicUpdate } from "@app/api";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "../components/AppIcon";
import { useCatalog } from "../contexts/CatalogContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

type EditComicScreenProps = {
  comic: Comic;
  onBack: () => void;
  onSaved: () => void;
};

type EditableFields = {
  title: string;
  issue: string;
  variant: string;
  grade: string;
  year: string;
  encapsulationDate: string;
  keyNotes: string;
  acquiredCost: string;
  acquiredSource: string;
};

function comicToFields(comic: Comic): EditableFields {
  return {
    title: comic.title ?? "",
    issue: comic.issue ?? "",
    variant: comic.variant ?? "",
    grade: comic.grade != null ? String(comic.grade) : "",
    year: comic.year != null ? String(comic.year) : "",
    encapsulationDate: comic.encapsulation_date ?? "",
    keyNotes: (comic.key_notes ?? []).join("\n"),
    acquiredCost: comic.acquired_cost != null ? String(comic.acquired_cost) : "",
    acquiredSource: comic.acquired_source ?? "",
  };
}

function parseNumber(input: string): number | null {
  if (!input.trim()) return null;
  const value = Number.parseFloat(input);
  return Number.isNaN(value) ? null : value;
}

function parseInt10(input: string): number | null {
  if (!input.trim()) return null;
  const value = Number.parseInt(input, 10);
  return Number.isNaN(value) ? null : value;
}

function fieldsToUpdate(fields: EditableFields): ComicUpdate {
  return {
    title: fields.title.trim() || null,
    issue: fields.issue.trim() || null,
    variant: fields.variant.trim() || null,
    grade: parseNumber(fields.grade),
    year: parseInt10(fields.year),
    encapsulation_date: fields.encapsulationDate.trim() || null,
    key_notes: fields.keyNotes
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    acquired_cost: parseNumber(fields.acquiredCost),
    acquired_source: fields.acquiredSource.trim() || null,
  };
}

export function EditComicScreen({
  comic,
  onBack,
  onSaved,
}: EditComicScreenProps) {
  const insets = useSafeAreaInsets();
  const { refresh } = useCatalog();
  const [fields, setFields] = useState<EditableFields>(() =>
    comicToFields(comic),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(
    <K extends keyof EditableFields>(key: K, value: EditableFields[K]) => {
      setFields((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await updateComic(supabase, comic.org_id, comic.id, fieldsToUpdate(fields));
      await refresh();
      onSaved();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err ?? "Update failed.");
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [comic.org_id, comic.id, fields, refresh, onSaved]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <AppIcon name="chevron-back" size={24} color={colors.text} />
        <Text style={styles.backLabel}>Catalog</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Edit comic</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{comic.grader}</Text>
          <Text style={styles.metaCert}>{comic.cert_number}</Text>
        </View>

        <Field
          label="Title"
          value={fields.title}
          onChange={(v) => update("title", v)}
        />
        <Field
          label="Issue"
          value={fields.issue}
          onChange={(v) => update("issue", v)}
          mono
        />
        <Field
          label="Grade"
          value={fields.grade}
          onChange={(v) => update("grade", v)}
          mono
          keyboardType="decimal-pad"
        />
        <Field
          label="Year"
          value={fields.year}
          onChange={(v) => update("year", v)}
          mono
          keyboardType="number-pad"
        />
        <Field
          label="Variant"
          value={fields.variant}
          onChange={(v) => update("variant", v)}
        />
        <Field
          label="Encapsulation date"
          placeholder="YYYY-MM-DD"
          value={fields.encapsulationDate}
          onChange={(v) => update("encapsulationDate", v)}
          mono
        />
        <Field
          label="Key notes"
          value={fields.keyNotes}
          onChange={(v) => update("keyNotes", v)}
          multiline
        />
        <Field
          label="Acquired cost (USD)"
          value={fields.acquiredCost}
          onChange={(v) => update("acquiredCost", v)}
          mono
          keyboardType="decimal-pad"
        />
        <Field
          label="Acquired from"
          value={fields.acquiredSource}
          onChange={(v) => update("acquiredSource", v)}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          disabled={saving}
          onPress={() => void handleSave()}
        >
          {saving ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.saveLabel}>Save changes</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  mono,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  mono?: boolean;
  placeholder?: string;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, mono && styles.inputMono, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
    paddingHorizontal: 20,
  },
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginBottom: 8,
  },
  backLabel: { color: colors.text, fontSize: 16, fontWeight: "500" },
  scroll: { gap: 12, paddingTop: 4 },
  title: { color: colors.text, fontSize: 26, fontWeight: "700" },
  metaRow: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  metaLabel: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  metaCert: {
    color: colors.text,
    flex: 1,
    fontFamily: "Menlo",
    fontSize: 15,
    fontWeight: "600",
  },
  field: { gap: 6 },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputMono: { fontFamily: "Menlo" },
  inputMulti: { minHeight: 88, textAlignVertical: "top" },
  error: { color: colors.danger, fontSize: 13, textAlign: "center" },
  saveButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    marginTop: 8,
    paddingVertical: 16,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveLabel: { color: colors.text, fontSize: 16, fontWeight: "700" },
});
