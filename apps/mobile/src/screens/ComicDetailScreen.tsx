import { createSignedPhotoUrl, type Comic, type Photo } from "@app/api";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "../components/AppIcon";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

const SIGNED_URL_TTL = 60 * 60;

type ComicDetailScreenProps = {
  comic: Comic;
  photos: Photo[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

type CoverUrls = { front: string | null; back: string | null };

export function ComicDetailScreen({
  comic,
  photos,
  onBack,
  onEdit,
  onDelete,
}: ComicDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const [urls, setUrls] = useState<CoverUrls>({ front: null, back: null });
  const [urlsLoading, setUrlsLoading] = useState(true);

  const frontPhoto = useMemo(
    () => photos.find((p) => p.position === "front") ?? null,
    [photos],
  );
  const backPhoto = useMemo(
    () => photos.find((p) => p.position === "back") ?? null,
    [photos],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setUrlsLoading(true);
      try {
        const [front, back] = await Promise.all([
          frontPhoto
            ? createSignedPhotoUrl(
                supabase,
                frontPhoto.storage_path,
                SIGNED_URL_TTL,
              ).catch(() => null)
            : Promise.resolve(null),
          backPhoto
            ? createSignedPhotoUrl(
                supabase,
                backPhoto.storage_path,
                SIGNED_URL_TTL,
              ).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!cancelled) setUrls({ front, back });
      } finally {
        if (!cancelled) setUrlsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [frontPhoto, backPhoto]);

  const titleLine =
    [comic.title, comic.issue ? `#${comic.issue}` : null]
      .filter(Boolean)
      .join(" ") || "Untitled comic";
  const gradeDisplay =
    comic.grade != null ? Number(comic.grade).toFixed(1) : "—";

  const keyNotes = comic.key_notes ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <AppIcon name="chevron-back" size={24} color={colors.text} />
          <Text style={styles.backLabel}>Catalog</Text>
        </Pressable>
        <View style={styles.topActions}>
          <Pressable
            onPress={onEdit}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.iconButtonPressed,
            ]}
            hitSlop={8}
            accessibilityLabel="Edit comic"
          >
            <AppIcon name="create-outline" size={18} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [
              styles.iconButton,
              styles.iconButtonDanger,
              pressed && styles.iconButtonPressed,
            ]}
            hitSlop={8}
            accessibilityLabel="Delete comic"
          >
            <AppIcon name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{titleLine}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaGrader}>{comic.grader}</Text>
          <Text style={styles.metaCert}>{comic.cert_number}</Text>
          <View style={styles.gradePill}>
            <Text style={styles.gradeNumber}>{gradeDisplay}</Text>
          </View>
        </View>

        <View style={styles.coverRow}>
          <CoverPanel
            label="Front"
            uri={urls.front}
            loading={urlsLoading}
            missing={!frontPhoto}
          />
          <CoverPanel
            label="Back"
            uri={urls.back}
            loading={urlsLoading}
            missing={!backPhoto}
          />
        </View>

        <View style={styles.detailsCard}>
          <DetailRow label="Year" value={comic.year ? String(comic.year) : "—"} />
          <DetailRow label="Variant" value={comic.variant || "—"} />
          <DetailRow
            label="Encapsulated"
            value={comic.encapsulation_date || "—"}
          />
          <DetailRow
            label="Status"
            value={formatStatus(comic.status)}
          />
          <DetailRow
            label="Acquired cost"
            value={
              comic.acquired_cost != null
                ? `$${Number(comic.acquired_cost).toFixed(2)}`
                : "—"
            }
          />
          <DetailRow
            label="Acquired from"
            value={comic.acquired_source || "—"}
            last
          />
        </View>

        {keyNotes.length > 0 ? (
          <View style={styles.notesCard}>
            <Text style={styles.notesHeader}>Key notes</Text>
            {keyNotes.map((note, idx) => (
              <Text key={`${idx}-${note}`} style={styles.noteItem}>
                • {note}
              </Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function CoverPanel({
  label,
  uri,
  loading,
  missing,
}: {
  label: string;
  uri: string | null;
  loading: boolean;
  missing: boolean;
}) {
  return (
    <View style={styles.coverPanel}>
      <View style={styles.coverImageWrap}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.coverImage}
            resizeMode="contain"
          />
        ) : loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <AppIcon
            name={missing ? "image-outline" : "warning-outline"}
            size={28}
            color={colors.textMuted}
          />
        )}
      </View>
      <Text style={styles.coverLabel}>{label}</Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function formatStatus(status: Comic["status"]): string {
  if (!status) return "—";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
    paddingHorizontal: 20,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  backLabel: { color: colors.text, fontSize: 16, fontWeight: "500" },
  topActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  iconButtonDanger: { borderColor: "rgba(255, 92, 122, 0.45)" },
  iconButtonPressed: { opacity: 0.65 },
  scroll: { gap: 16, paddingTop: 4 },
  title: { color: colors.text, fontSize: 24, fontWeight: "700" },
  metaRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  metaGrader: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  metaCert: {
    color: colors.text,
    flex: 1,
    fontFamily: "Menlo",
    fontSize: 14,
    fontWeight: "600",
  },
  gradePill: {
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  gradeNumber: {
    color: colors.accent,
    fontFamily: "Menlo",
    fontSize: 16,
    fontWeight: "700",
  },
  coverRow: {
    flexDirection: "row",
    gap: 12,
  },
  coverPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: 8,
  },
  coverImageWrap: {
    alignItems: "center",
    aspectRatio: 0.66,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    justifyContent: "center",
    overflow: "hidden",
    width: "100%",
  },
  coverImage: { height: "100%", width: "100%" },
  coverLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  detailRow: {
    borderBottomColor: colors.surfaceBorder,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    width: 130,
  },
  detailValue: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "right",
  },
  notesCard: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  notesHeader: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  noteItem: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
