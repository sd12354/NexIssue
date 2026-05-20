import { CertLookupError, lookupCert } from "@app/api";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "../components/AppIcon";
import { FEATURES } from "../config/features";
import { useAuth } from "../contexts/AuthContext";
import { useCatalog } from "../contexts/CatalogContext";
import { saveComicAndCovers } from "../lib/saveComic";
import { supabase } from "../lib/supabase";
import {
  emptyLabelFields,
  type CertConfirmParams,
  type ParsedLabelFields,
} from "../lib/labelTypes";
import { colors } from "../theme/colors";

type CertConfirmScreenProps = {
  params: CertConfirmParams;
  onBack: () => void;
  onSaved: () => void;
};

function extractSupabaseErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj.message === "string" && obj.message) parts.push(obj.message);
    if (typeof obj.error === "string" && obj.error) parts.push(obj.error);
    if (typeof obj.statusCode === "string" || typeof obj.statusCode === "number") {
      parts.push(`status ${obj.statusCode}`);
    }
    if (typeof obj.code === "string" && obj.code) parts.push(`code ${obj.code}`);
    if (typeof obj.hint === "string" && obj.hint) parts.push(obj.hint);
    if (parts.length > 0) return parts.join(" · ");
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return "Failed to save comic.";
}

function FormField({
  label,
  value,
  onChangeText,
  multiline = false,
  mono = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, mono && styles.inputMono, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

export function CertConfirmScreen({
  params,
  onBack,
  onSaved,
}: CertConfirmScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { orgId, refresh } = useCatalog();
  const [fields, setFields] = useState<ParsedLabelFields>(
    params.label ?? emptyLabelFields(),
  );
  const [rawOcrExpanded, setRawOcrExpanded] = useState(false);
  const [edgeLoading, setEdgeLoading] = useState(false);
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasCovers = !!params.covers;
  const canSave = !saving && !!orgId && !!user && hasCovers;

  const handleSave = useCallback(async () => {
    if (!user || !orgId || !params.covers) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveComicAndCovers({
        orgId,
        userId: user.id,
        grader: params.grader,
        certNumber: params.certNumber,
        label: fields,
        covers: params.covers,
      });
      await refresh();
      onSaved();
    } catch (err) {
      console.error("[saveComic] failed", err);
      const message = extractSupabaseErrorMessage(err);
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }, [user, orgId, params.covers, params.grader, params.certNumber, fields, refresh, onSaved]);

  const updateField = <K extends keyof ParsedLabelFields>(
    key: K,
    value: ParsedLabelFields[K],
  ) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const runEdgeLookup = useCallback(async () => {
    if (!FEATURES.CERT_LOOKUP_EDGE_ENABLED) return;
    setEdgeLoading(true);
    setEdgeError(null);
    try {
      const data = await lookupCert(supabase, {
        grader: params.grader,
        certNumber: params.certNumber,
      });
      setFields((prev) => ({
        title: prev.title || data.title || "",
        issue: prev.issue || data.issue || "",
        variant: prev.variant || data.variant || "",
        grade: prev.grade || data.grade || "",
        year: prev.year || (data.year != null ? String(data.year) : ""),
        pageColor: prev.pageColor,
        encapsulationDate:
          prev.encapsulationDate || data.encapsulationDate || "",
        keyNotes:
          prev.keyNotes ||
          (data.keyNotes.length > 0 ? data.keyNotes.join("\n") : ""),
      }));
    } catch (err) {
      const message =
        err instanceof CertLookupError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Lookup failed";
      setEdgeError(message);
    } finally {
      setEdgeLoading(false);
    }
  }, [params.grader, params.certNumber]);

  useEffect(() => {
    if (FEATURES.CERT_LOOKUP_EDGE_ENABLED && params.grader !== "CGC") {
      void runEdgeLookup();
    }
  }, [params.grader, runEdgeLookup]);

  const lowConfidence = params.ocrConfidence === "low";
  const hasOcr = Boolean(params.rawOcrText?.trim());

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <AppIcon name="chevron-back" size={24} color={colors.text} />
        <Text style={styles.backLabel}>Back</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Confirm details</Text>
        <Text style={styles.subtitle}>
          Review OCR results and fix any mistakes before saving to catalog.
        </Text>

        {lowConfidence ? (
          <View style={styles.warnBanner}>
            <AppIcon name="warning-outline" size={20} color="#FFB020" />
            <Text style={styles.warnText}>
              OCR confidence is low — please verify every field below.
            </Text>
          </View>
        ) : null}

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{params.grader}</Text>
          <Text style={styles.metaCert}>{params.certNumber}</Text>
        </View>

        {params.covers ? (
          <View style={styles.coversRow}>
            <View style={styles.coverThumb}>
              <Image
                source={{ uri: params.covers.front.uri }}
                style={styles.coverImage}
                resizeMode="contain"
              />
              <Text style={styles.coverCaption}>
                Front{params.covers.front.backgroundRemoved ? " · BG removed" : ""}
              </Text>
            </View>
            <View style={styles.coverThumb}>
              <Image
                source={{ uri: params.covers.back.uri }}
                style={styles.coverImage}
                resizeMode="contain"
              />
              <Text style={styles.coverCaption}>
                Back{params.covers.back.backgroundRemoved ? " · BG removed" : ""}
              </Text>
            </View>
          </View>
        ) : null}

        {FEATURES.CERT_LOOKUP_EDGE_ENABLED ? (
          <Pressable
            disabled={edgeLoading}
            onPress={() => void runEdgeLookup()}
            style={styles.edgeButton}
          >
            {edgeLoading ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text style={styles.edgeButtonLabel}>Try online cert lookup</Text>
            )}
          </Pressable>
        ) : null}
        {edgeError ? <Text style={styles.edgeError}>{edgeError}</Text> : null}

        <FormField
          label="Title"
          value={fields.title}
          onChangeText={(v) => updateField("title", v)}
        />
        <FormField
          label="Issue"
          value={fields.issue}
          onChangeText={(v) => updateField("issue", v)}
          mono
        />
        <FormField
          label="Grade"
          value={fields.grade}
          onChangeText={(v) => updateField("grade", v)}
          mono
        />
        <FormField
          label="Cover date"
          placeholder="MM/YY (e.g. 12/24)"
          value={fields.year}
          onChangeText={(v) => updateField("year", v)}
          mono
        />
        <FormField
          label="Variant"
          value={fields.variant}
          onChangeText={(v) => updateField("variant", v)}
        />
        <FormField
          label="Page color"
          value={fields.pageColor}
          onChangeText={(v) => updateField("pageColor", v)}
        />
        <FormField
          label="Encapsulation date"
          value={fields.encapsulationDate}
          onChangeText={(v) => updateField("encapsulationDate", v)}
        />
        <FormField
          label="Key notes"
          value={fields.keyNotes}
          onChangeText={(v) => updateField("keyNotes", v)}
          multiline
        />

        {hasOcr ? (
          <View style={styles.rawSection}>
            <Pressable
              onPress={() => setRawOcrExpanded((v) => !v)}
              style={styles.rawHeader}
            >
              <Text style={styles.rawTitle}>Raw OCR text</Text>
              <AppIcon
                name={rawOcrExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
            {rawOcrExpanded ? (
              <Text style={styles.rawBody}>{params.rawOcrText}</Text>
            ) : null}
          </View>
        ) : null}

        {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}

        <Pressable
          style={[
            styles.saveButtonActive,
            !canSave && styles.saveButtonDisabled,
          ]}
          disabled={!canSave}
          onPress={() => void handleSave()}
        >
          {saving ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.saveActiveLabel}>
              {hasCovers ? "Save to catalog" : "Capture covers first"}
            </Text>
          )}
        </Pressable>
      </ScrollView>
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
  backLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "500",
  },
  scroll: {
    gap: 12,
    paddingTop: 4,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  warnBanner: {
    alignItems: "center",
    backgroundColor: "rgba(255, 176, 32, 0.12)",
    borderColor: "rgba(255, 176, 32, 0.35)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  warnText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  metaLabel: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700",
  },
  metaCert: {
    color: colors.text,
    flex: 1,
    fontFamily: "Menlo",
    fontSize: 15,
    fontWeight: "600",
  },
  edgeButton: {
    alignItems: "center",
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
  },
  edgeButtonLabel: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  edgeError: {
    color: colors.danger,
    fontSize: 13,
  },
  field: {
    gap: 6,
  },
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
  inputMono: {
    fontFamily: "Menlo",
  },
  inputMulti: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  rawSection: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    overflow: "hidden",
  },
  rawHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 14,
  },
  rawTitle: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  rawBody: {
    borderTopColor: colors.surfaceBorder,
    borderTopWidth: 1,
    color: colors.textMuted,
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 18,
    padding: 14,
  },
  saveButtonActive: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    marginTop: 8,
    paddingVertical: 16,
  },
  saveButtonDisabled: {
    backgroundColor: colors.surface,
    opacity: 0.6,
  },
  saveActiveLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  saveError: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },
  coversRow: {
    flexDirection: "row",
    gap: 10,
  },
  coverThumb: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    padding: 6,
  },
  coverImage: {
    aspectRatio: 0.66,
    backgroundColor: "#0A0A12",
    borderRadius: 6,
    width: "100%",
  },
  coverCaption: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
    textAlign: "center",
  },
});
