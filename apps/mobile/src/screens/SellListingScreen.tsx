import {
  createSignedPhotoUrl,
  generateListingDraft,
  getIntegration,
  publishListing,
  type Comic,
  type Photo,
} from "@app/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useCatalog } from "../contexts/CatalogContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

const SIGNED_URL_TTL = 60 * 60;

type SellListingScreenProps = {
  comic: Comic;
  photos: Photo[];
  onBack: () => void;
  onPublished: () => void;
  onOpenIntegrations: () => void;
};

export function SellListingScreen({
  comic,
  photos,
  onBack,
  onPublished,
  onOpenIntegrations,
}: SellListingScreenProps) {
  const insets = useSafeAreaInsets();
  const { refresh } = useCatalog();
  const draft = useMemo(() => generateListingDraft(comic), [comic]);

  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description);
  const [price, setPrice] = useState(
    draft.suggestedPrice != null ? draft.suggestedPrice.toFixed(2) : "",
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(true);
  const [ebayConnected, setEbayConnected] = useState<boolean | null>(null);
  const [ebayAccount, setEbayAccount] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const frontPhoto = useMemo(
    () => photos.find((p) => p.position === "front") ?? photos[0] ?? null,
    [photos],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const integration = await getIntegration(supabase, comic.org_id, "ebay");
        if (cancelled) return;
        setEbayConnected(!!integration);
        setEbayAccount(
          typeof integration?.metadata?.account === "string"
            ? integration.metadata.account
            : null,
        );
      } catch {
        if (!cancelled) setEbayConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [comic.org_id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCoverLoading(true);
      try {
        if (!frontPhoto) {
          if (!cancelled) setCoverUrl(null);
          return;
        }
        const url = await createSignedPhotoUrl(
          supabase,
          frontPhoto.storage_path,
          SIGNED_URL_TTL,
        );
        if (!cancelled) setCoverUrl(url);
      } catch {
        if (!cancelled) setCoverUrl(null);
      } finally {
        if (!cancelled) setCoverLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [frontPhoto]);

  const parsedPrice = useMemo(() => {
    const value = Number.parseFloat(price.replace(/[^0-9.]/g, ""));
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [price]);

  const canPublish =
    ebayConnected === true &&
    title.trim().length > 0 &&
    description.trim().length > 0 &&
    parsedPrice != null &&
    photos.length > 0 &&
    !publishing;

  const handleConnectEbay = useCallback(() => {
    Alert.alert(
      "Connect eBay",
      "Link your eBay seller account to publish listings.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Integrations", onPress: onOpenIntegrations },
      ],
    );
  }, [onOpenIntegrations]);

  const handlePublish = useCallback(async () => {
    if (!canPublish || parsedPrice == null) return;

    if (ebayConnected !== true) {
      handleConnectEbay();
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      const result = await publishListing(supabase, {
        comicId: comic.id,
        title: title.trim(),
        description: description.trim(),
        askingPrice: parsedPrice,
      });
      await refresh();
      Alert.alert(
        "Listed on eBay",
        result.listingUrl
          ? `Your comic is live on eBay.\n\n${result.listingUrl}`
          : "Your comic is now listed on eBay.",
        [{ text: "Done", onPress: onPublished }],
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not publish listing.";
      setError(message);
    } finally {
      setPublishing(false);
    }
  }, [
    canPublish,
    comic.id,
    description,
    ebayConnected,
    handleConnectEbay,
    onPublished,
    parsedPrice,
    refresh,
    title,
  ]);

  const titleLine =
    [comic.title, comic.issue ? `#${comic.issue}` : null]
      .filter(Boolean)
      .join(" ") || `Cert ${comic.cert_number}`;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <AppIcon name="chevron-back" size={24} color={colors.text} />
          <Text style={styles.backLabel}>Catalog</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Sell on eBay</Text>
        <Text style={styles.subheading}>{titleLine}</Text>

        {ebayConnected === false ? (
          <Pressable onPress={handleConnectEbay} style={styles.banner}>
            <AppIcon name="link-outline" size={18} color={colors.accent} />
            <Text style={styles.bannerText}>
              Connect eBay to publish this listing
            </Text>
          </Pressable>
        ) : ebayConnected === true ? (
          <View style={styles.connectedRow}>
            <AppIcon name="checkmark-circle" size={16} color={colors.accent} />
            <Text style={styles.connectedText}>
              eBay connected{ebayAccount ? ` · ${ebayAccount}` : ""}
            </Text>
          </View>
        ) : null}

        <View style={styles.previewRow}>
          <View style={styles.thumb}>
            {coverLoading ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : coverUrl ? (
              <Image source={{ uri: coverUrl }} style={styles.thumbImage} />
            ) : (
              <AppIcon name="image-outline" size={22} color={colors.textMuted} />
            )}
          </View>
          <View style={styles.previewMeta}>
            <Text style={styles.previewLabel}>Photos</Text>
            <Text style={styles.previewValue}>
              {photos.length} on file · {draft.categoryLabel}
            </Text>
          </View>
        </View>

        <Field label="Listing title" hint={`${title.length}/80 characters`}>
          <TextInput
            value={title}
            onChangeText={(v) => setTitle(v.slice(0, 80))}
            style={styles.input}
            placeholder="eBay listing title"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
          />
        </Field>

        <Field label="Asking price (USD)">
          <TextInput
            value={price}
            onChangeText={setPrice}
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
          />
          {draft.suggestedPrice == null ? (
            <Text style={styles.fieldHint}>
              Add an acquired cost on the comic to get a suggested price.
            </Text>
          ) : null}
        </Field>

        <Field label="Description">
          <TextInput
            value={description}
            onChangeText={setDescription}
            style={[styles.input, styles.textArea]}
            placeholder="Listing description"
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
          />
        </Field>

        <View style={styles.specificsCard}>
          <Text style={styles.specificsTitle}>Item specifics</Text>
          {Object.entries(draft.itemSpecifics).map(([key, value]) => (
            <View key={key} style={styles.specificRow}>
              <Text style={styles.specificKey}>{key}</Text>
              <Text style={styles.specificValue}>{value}</Text>
            </View>
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          onPress={() => void handlePublish()}
          disabled={!canPublish}
          style={({ pressed }) => [
            styles.publishButton,
            !canPublish && styles.publishButtonDisabled,
            pressed && canPublish && styles.publishButtonPressed,
          ]}
        >
          {publishing ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <>
              <AppIcon name="pricetag-outline" size={18} color={colors.text} />
              <Text style={styles.publishLabel}>Publish to eBay</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
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
    marginBottom: 8,
  },
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  backLabel: { color: colors.text, fontSize: 16, fontWeight: "500" },
  scroll: { gap: 16, paddingTop: 4 },
  heading: { color: colors.text, fontSize: 24, fontWeight: "700" },
  subheading: { color: colors.textMuted, fontSize: 14, marginTop: -8 },
  banner: {
    alignItems: "center",
    backgroundColor: "rgba(255, 92, 122, 0.12)",
    borderColor: "rgba(255, 92, 122, 0.35)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerText: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "500" },
  connectedRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  connectedText: { color: colors.textMuted, fontSize: 13 },
  previewRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  thumb: {
    alignItems: "center",
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    height: 72,
    justifyContent: "center",
    overflow: "hidden",
    width: 52,
  },
  thumbImage: { height: "100%", width: "100%" },
  previewMeta: { flex: 1, gap: 2 },
  previewLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  previewValue: { color: colors.text, fontSize: 14 },
  field: { gap: 8 },
  fieldHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  fieldLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  fieldHint: { color: colors.textMuted, fontSize: 12 },
  input: {
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: { minHeight: 140 },
  specificsCard: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  specificsTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 10,
  },
  specificRow: {
    borderTopColor: colors.surfaceBorder,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
  },
  specificKey: { color: colors.textMuted, flex: 1, fontSize: 13 },
  specificValue: {
    color: colors.text,
    flex: 1.2,
    fontSize: 13,
    textAlign: "right",
  },
  errorText: { color: colors.danger, fontSize: 13 },
  publishButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 4,
    paddingVertical: 16,
  },
  publishButtonDisabled: { opacity: 0.45 },
  publishButtonPressed: { opacity: 0.85 },
  publishLabel: { color: colors.text, fontSize: 16, fontWeight: "700" },
});
