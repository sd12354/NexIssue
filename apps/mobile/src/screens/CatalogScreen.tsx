import { deleteComic, deleteComicPhotos, type Comic } from "@app/api";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "../components/AppIcon";
import { Screen } from "../components/Screen";
import { useCatalog, type CatalogEntry } from "../contexts/CatalogContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";
import { ComicDetailScreen } from "./ComicDetailScreen";
import { EditComicScreen } from "./EditComicScreen";
import { SellListingScreen } from "./SellListingScreen";

type CatalogScreenProps = {
  onAdd: () => void;
  onOpenIntegrations: () => void;
};

type StatusFilter = "all" | Comic["status"];

const STATUS_FILTERS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in_inventory", label: "In Inventory" },
  { id: "listed", label: "Listed" },
  { id: "sold", label: "Sold" },
];

export function CatalogScreen({ onAdd, onOpenIntegrations }: CatalogScreenProps) {
  const insets = useSafeAreaInsets();
  const { entries, loading, error, refresh } = useCatalog();
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sellingId, setSellingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const runDelete = useCallback(
    async (entry: CatalogEntry) => {
      setActionError(null);
      setDeletingId(entry.comic.id);
      try {
        // Best-effort storage cleanup before the row goes away.
        try {
          await deleteComicPhotos(
            supabase,
            entry.comic.org_id,
            entry.comic.id,
          );
        } catch (storageErr) {
          console.warn("[catalog] storage cleanup failed", storageErr);
        }
        await deleteComic(supabase, entry.comic.org_id, entry.comic.id);
        await refresh();
        setViewingId((current) =>
          current === entry.comic.id ? null : current,
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : String(err ?? "Delete failed");
        setActionError(message);
      } finally {
        setDeletingId(null);
      }
    },
    [refresh],
  );

  const handleDelete = useCallback(
    (entry: CatalogEntry) => {
      const titleLine =
        [entry.comic.title, entry.comic.issue ? `#${entry.comic.issue}` : null]
          .filter(Boolean)
          .join(" ") || `Cert ${entry.comic.cert_number}`;
      Alert.alert(
        "Delete comic?",
        `${titleLine} will be removed from your catalog, including its cover photos. This can't be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => void runDelete(entry),
          },
        ],
      );
    },
    [runDelete],
  );

  const viewingEntry = useMemo(
    () => entries.find((e) => e.comic.id === viewingId) ?? null,
    [entries, viewingId],
  );
  const editingEntry = useMemo(
    () => entries.find((e) => e.comic.id === editingId) ?? null,
    [entries, editingId],
  );
  const sellingEntry = useMemo(
    () => entries.find((e) => e.comic.id === sellingId) ?? null,
    [entries, sellingId],
  );

  const handleSellNow = useCallback((entry: CatalogEntry) => {
    if (entry.comic.status !== "in_inventory") return;
    setSellingId(entry.comic.id);
    setViewingId(null);
    setEditingId(null);
  }, []);

  const totalValue = useMemo(() => {
    return entries.reduce(
      (sum, entry) => sum + Number(entry.comic.acquired_cost ?? 0),
      0,
    );
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (statusFilter !== "all" && entry.comic.status !== statusFilter) {
        return false;
      }
      if (needle) {
        const title = (entry.comic.title ?? "").toLowerCase();
        const issue = (entry.comic.issue ?? "").toLowerCase();
        return title.includes(needle) || issue.includes(needle);
      }
      return true;
    });
  }, [entries, statusFilter, searchQuery]);

  // ---- ALL hooks above this line. Conditional renders below. ----

  if (editingEntry) {
    return (
      <EditComicScreen
        comic={editingEntry.comic}
        onBack={() => setEditingId(null)}
        onSaved={() => setEditingId(null)}
      />
    );
  }

  if (sellingEntry) {
    return (
      <SellListingScreen
        comic={sellingEntry.comic}
        photos={sellingEntry.photos}
        onBack={() => setSellingId(null)}
        onPublished={() => {
          setSellingId(null);
          void refresh();
        }}
        onOpenIntegrations={onOpenIntegrations}
      />
    );
  }

  if (viewingEntry) {
    return (
      <ComicDetailScreen
        comic={viewingEntry.comic}
        photos={viewingEntry.photos}
        onBack={() => setViewingId(null)}
        onEdit={() => {
          setEditingId(viewingEntry.comic.id);
          setViewingId(null);
        }}
        onDelete={() => handleDelete(viewingEntry)}
        onSellNow={() => handleSellNow(viewingEntry)}
      />
    );
  }

  if (loading && entries.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.mutedText}>Loading your catalog…</Text>
        </View>
      </Screen>
    );
  }

  if (entries.length === 0) {
    return (
      <Screen>
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <AppIcon name="library-outline" size={36} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>No comics yet</Text>
          <Text style={styles.emptyBody}>
            Scan a slab to add your first graded comic. We'll capture the
            cert, label, and clean front + back photos for eBay.
          </Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Pressable onPress={onAdd} style={styles.cta}>
            <AppIcon name="scan-outline" size={18} color={colors.text} />
            <Text style={styles.ctaLabel}>Scan your first slab</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const showFilterEmpty = filteredEntries.length === 0;
  const filterEmptyReason = searchQuery.trim()
    ? `No comics match "${searchQuery.trim()}".`
    : `No comics in ${
        STATUS_FILTERS.find((f) => f.id === statusFilter)?.label ?? "this filter"
      }.`;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.heading}>Catalog</Text>
        <Text style={styles.subheading}>
          {entries.length} comic{entries.length === 1 ? "" : "s"}
          {totalValue > 0 ? ` · Cost basis $${totalValue.toFixed(2)}` : ""}
        </Text>
      </View>

      <View style={styles.searchBar}>
        <AppIcon name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by title or issue"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.searchInput}
        />
        {searchQuery.length > 0 ? (
          <Pressable
            onPress={() => setSearchQuery("")}
            hitSlop={10}
            accessibilityLabel="Clear search"
          >
            <AppIcon
              name="close-circle"
              size={18}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsRow}
      >
        {STATUS_FILTERS.map((option) => {
          const active = statusFilter === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setStatusFilter(option.id)}
              accessibilityLabel={`Filter: ${option.label}`}
              style={({ pressed }) => [
                styles.chip,
                active ? styles.chipActive : styles.chipInactive,
                pressed && styles.chipPressed,
              ]}
            >
              <Text
                style={[
                  styles.chipLabel,
                  active ? styles.chipLabelActive : styles.chipLabelInactive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {actionError ? (
        <View style={styles.actionErrorBanner}>
          <AppIcon name="warning-outline" size={16} color={colors.danger} />
          <Text style={styles.actionErrorText} numberOfLines={2}>
            {actionError}
          </Text>
        </View>
      ) : null}

      {showFilterEmpty ? (
        <View style={styles.filterEmpty}>
          <AppIcon name="search" size={20} color={colors.textMuted} />
          <Text style={styles.filterEmptyText}>{filterEmptyReason}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredEntries}
          keyExtractor={(item) => item.comic.id}
          renderItem={({ item }) => (
            <CatalogRow
              entry={item}
              busy={deletingId === item.comic.id}
              onView={() => setViewingId(item.comic.id)}
              onEdit={() => setEditingId(item.comic.id)}
              onDelete={() => handleDelete(item)}
              onSell={() => handleSellNow(item)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              onRefresh={refresh}
              refreshing={loading}
              tintColor={colors.accent}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <Pressable
        onPress={onAdd}
        accessibilityLabel="Scan a slab"
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 20 },
          pressed && styles.fabPressed,
        ]}
      >
        <AppIcon name="scan-outline" size={24} color={colors.text} />
      </Pressable>
    </Screen>
  );
}

function CatalogRow({
  entry,
  busy,
  onView,
  onEdit,
  onDelete,
  onSell,
}: {
  entry: CatalogEntry;
  busy: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSell: () => void;
}) {
  const { comic, coverUrl } = entry;
  const grade = comic.grade != null ? Number(comic.grade).toFixed(1) : "—";
  const titleLine = [comic.title, comic.issue ? `#${comic.issue}` : null]
    .filter(Boolean)
    .join(" ");
  const meta = [
    comic.grader,
    comic.year ? String(comic.year) : null,
    comic.variant || null,
  ]
    .filter(Boolean)
    .join(" · ");
  const canSell = comic.status === "in_inventory";

  return (
    <View style={[styles.row, busy && styles.rowBusy]}>
      <Pressable
        onPress={onView}
        disabled={busy}
        accessibilityLabel="View comic details"
        style={({ pressed }) => [
          styles.rowMain,
          pressed && styles.rowMainPressed,
        ]}
      >
        <View style={styles.thumb}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.thumbImage} />
          ) : (
            <AppIcon name="image-outline" size={22} color={colors.textMuted} />
          )}
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {titleLine || "Untitled comic"}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {meta || "—"}
          </Text>
          <Text style={styles.rowCert} numberOfLines={1}>
            Cert {comic.cert_number}
          </Text>
        </View>
        <View style={styles.gradePill}>
          <Text style={styles.gradeNumber}>{grade}</Text>
        </View>
      </Pressable>
      <View style={styles.rowActions}>
        {canSell ? (
          <Pressable
            accessibilityLabel="Sell now on eBay"
            onPress={onSell}
            disabled={busy}
            style={({ pressed }) => [
              styles.actionButton,
              styles.actionButtonSell,
              pressed && styles.actionButtonPressed,
            ]}
            hitSlop={8}
          >
            <AppIcon name="pricetag-outline" size={18} color={colors.accent} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="Edit comic"
          onPress={onEdit}
          disabled={busy}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.actionButtonPressed,
          ]}
          hitSlop={8}
        >
          <AppIcon name="create-outline" size={18} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityLabel="Delete comic"
          onPress={onDelete}
          disabled={busy}
          style={({ pressed }) => [
            styles.actionButton,
            styles.actionButtonDanger,
            pressed && styles.actionButtonPressed,
          ]}
          hitSlop={8}
        >
          {busy ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <AppIcon name="trash-outline" size={18} color={colors.danger} />
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  mutedText: { color: colors.textMuted, fontSize: 14 },
  empty: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 40,
    borderWidth: 1,
    height: 72,
    justifyContent: "center",
    marginBottom: 4,
    width: 72,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  cta: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  ctaLabel: { color: colors.text, fontSize: 15, fontWeight: "600" },
  header: {
    paddingTop: 4,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subheading: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  searchBar: {
    alignItems: "center",
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  chipsScroll: { flexGrow: 0 },
  chipsRow: {
    alignItems: "center",
    gap: 8,
    paddingBottom: 4,
    paddingTop: 12,
  },
  chip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 4,
  },
  chipInactive: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
  },
  chipPressed: { opacity: 0.75 },
  chipLabel: { fontSize: 13, fontWeight: "600" },
  chipLabelActive: { color: colors.text },
  chipLabelInactive: { color: colors.textMuted },
  filterEmpty: {
    alignItems: "center",
    flex: 1,
    gap: 10,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  filterEmptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
  },
  fab: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 30,
    elevation: 8,
    height: 60,
    justifyContent: "center",
    position: "absolute",
    right: 24,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    width: 60,
  },
  fabPressed: {
    backgroundColor: colors.accentPressed,
    transform: [{ scale: 0.96 }],
  },
  listContent: { paddingBottom: 100, paddingTop: 14 },
  sep: { height: 10 },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 2,
  },
  rowBusy: { opacity: 0.55 },
  rowMain: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  rowMainPressed: { opacity: 0.7 },
  rowActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 10,
  },
  actionButton: {
    alignItems: "center",
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  actionButtonDanger: {
    borderColor: "rgba(255, 92, 122, 0.45)",
  },
  actionButtonSell: {
    borderColor: "rgba(124, 92, 255, 0.55)",
  },
  actionButtonPressed: { opacity: 0.65 },
  actionErrorBanner: {
    alignItems: "center",
    backgroundColor: "rgba(255, 92, 122, 0.14)",
    borderColor: "rgba(255, 92, 122, 0.4)",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionErrorText: { color: colors.text, flex: 1, fontSize: 13 },
  thumb: {
    alignItems: "center",
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    height: 84,
    justifyContent: "center",
    overflow: "hidden",
    width: 56,
  },
  thumbImage: { height: "100%", width: "100%" },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rowMeta: { color: colors.textMuted, fontSize: 13 },
  rowCert: {
    color: colors.textMuted,
    fontFamily: "Menlo",
    fontSize: 11,
  },
  gradePill: {
    alignItems: "center",
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  gradeNumber: {
    color: colors.accent,
    fontFamily: "Menlo",
    fontSize: 15,
    fontWeight: "700",
  },
});
