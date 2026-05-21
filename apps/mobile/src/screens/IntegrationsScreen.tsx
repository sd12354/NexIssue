/**
 * IntegrationsScreen — per-org marketplace integrations (PRD §9).
 *
 * Renders cards for eBay, Shippo, and GoCollect. eBay supports a full OAuth
 * round-trip:
 *   1. Tap "Connect" → asks `ebay-oauth-start` for an authorize URL.
 *   2. Opens the URL with `WebBrowser.openAuthSessionAsync` so iOS / Android
 *      OS browsers handle eBay's login session.
 *   3. The `ebay-oauth-callback` edge function 302-redirects to
 *      `nexissue://oauth/ebay/callback?status=...` — the auth session catches
 *      that redirect and returns control to the app.
 *   4. The screen re-reads `org_integrations` to show the connected state.
 *
 * Shippo and GoCollect are shown but disabled until their connect flows ship
 * in a later phase.
 */

import {
  disconnectIntegration,
  IntegrationError,
  listIntegrations,
  startEbayOAuth,
  type IntegrationMetadata,
  type IntegrationProvider,
  type OrgIntegration,
} from "@app/api";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AppIcon } from "../components/AppIcon";
import { Screen } from "../components/Screen";
import { useCatalog } from "../contexts/CatalogContext";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

WebBrowser.maybeCompleteAuthSession();

const APP_SCHEME = "nexissue";

type ProviderUi = {
  id: IntegrationProvider;
  name: string;
  description: string;
  logo: ImageSourcePropType;
  logoWide?: boolean;
  available: boolean;
  unavailableNote?: string;
};

const PROVIDERS: ReadonlyArray<ProviderUi> = [
  {
    id: "ebay",
    name: "eBay",
    description: "Publish listings and receive sold-item webhooks.",
    logo: require("../../assets/integrations/ebay-logo.png"),
    available: true,
  },
  {
    id: "shippo",
    name: "Shippo",
    description: "Auto-generate shipping labels when a comic sells.",
    logo: require("../../assets/integrations/shippo-logo.png"),
    available: false,
    unavailableNote: "Coming after Phase 4 (Fulfillment).",
  },
  {
    id: "gocollect",
    name: "GoCollect",
    description: "Fetch pricing comps and market index movements.",
    logo: require("../../assets/integrations/gocollect-logo.png"),
    logoWide: true,
    available: false,
    unavailableNote: "Coming with Pricing Intelligence (Phase 2).",
  },
];

type IntegrationStatus = "connected" | "available" | "unavailable";

function statusFor(
  provider: ProviderUi,
  integration: OrgIntegration | undefined,
): IntegrationStatus {
  if (integration) return "connected";
  if (provider.available) return "available";
  return "unavailable";
}

function ProviderLogo({
  source,
  wide,
  label,
}: {
  source: ImageSourcePropType;
  wide?: boolean;
  label: string;
}) {
  return (
    <View style={[styles.logoWrap, wide && styles.logoWrapWide]}>
      <Image
        accessibilityLabel={`${label} logo`}
        source={source}
        style={styles.logoImage}
        resizeMode="contain"
      />
    </View>
  );
}

function StatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === "connected") {
    return (
      <View style={[styles.badge, styles.badgeConnected]}>
        <View style={styles.badgeDotConnected} />
        <Text style={styles.badgeLabelConnected}>Connected</Text>
      </View>
    );
  }
  if (status === "available") {
    return (
      <View style={[styles.badge, styles.badgeAvailable]}>
        <Text style={styles.badgeLabel}>Not connected</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgeUnavailable]}>
      <Text style={styles.badgeLabel}>Coming soon</Text>
    </View>
  );
}

type IntegrationsScreenProps = {
  onBack: () => void;
};

export function IntegrationsScreen({ onBack }: IntegrationsScreenProps) {
  const { orgId } = useCatalog();
  const [integrations, setIntegrations] = useState<OrgIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<IntegrationProvider | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<
    { kind: "success" | "error"; message: string } | null
  >(null);

  const byProvider = useMemo(() => {
    const map = new Map<IntegrationProvider, OrgIntegration>();
    for (const row of integrations) map.set(row.provider, row);
    return map;
  }, [integrations]);

  const refresh = useCallback(async () => {
    if (!orgId) {
      setIntegrations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listIntegrations(supabase, orgId);
      setIntegrations(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load integrations.",
      );
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleConnectEbay = useCallback(async () => {
    if (!orgId || busyProvider) return;
    setBusyProvider("ebay");
    setError(null);
    setStatusBanner(null);
    try {
      const start = await startEbayOAuth(supabase, { returnScheme: APP_SCHEME });
      const redirectUrl = Linking.createURL("oauth/ebay/callback");
      const result = await WebBrowser.openAuthSessionAsync(
        start.authorizeUrl,
        redirectUrl,
        { showInRecents: false },
      );

      if (result.type === "cancel" || result.type === "dismiss") {
        setStatusBanner({
          kind: "error",
          message: "eBay sign-in was cancelled.",
        });
      } else if (result.type === "success" && result.url) {
        const parsed = Linking.parse(result.url);
        const params = (parsed.queryParams ?? {}) as Record<string, string>;
        if (params.status === "success") {
          setStatusBanner({
            kind: "success",
            message: params.account
              ? `Connected to eBay as ${params.account}.`
              : "eBay connected.",
          });
        } else {
          setStatusBanner({
            kind: "error",
            message: params.error_message ?? "eBay connection failed.",
          });
        }
        await refresh();
      }
    } catch (err) {
      const message = err instanceof IntegrationError
        ? err.message
        : err instanceof Error
        ? err.message
        : "Could not start eBay OAuth.";
      setStatusBanner({ kind: "error", message });
    } finally {
      setBusyProvider(null);
    }
  }, [orgId, busyProvider, refresh]);

  const handleDisconnect = useCallback(
    (provider: IntegrationProvider, accountLabel: string | null) => {
      if (!orgId) return;
      Alert.alert(
        `Disconnect ${provider}`,
        accountLabel
          ? `This will remove the saved tokens for ${accountLabel}. You can reconnect at any time.`
          : "This will remove the saved tokens. You can reconnect at any time.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect",
            style: "destructive",
            onPress: async () => {
              setBusyProvider(provider);
              try {
                await disconnectIntegration(supabase, orgId, provider);
                setStatusBanner({
                  kind: "success",
                  message: `${provider} disconnected.`,
                });
                await refresh();
              } catch (err) {
                setStatusBanner({
                  kind: "error",
                  message: err instanceof Error
                    ? err.message
                    : "Could not disconnect.",
                });
              } finally {
                setBusyProvider(null);
              }
            },
          },
        ],
      );
    },
    [orgId, refresh],
  );

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Pressable
          onPress={onBack}
          hitSlop={10}
          accessibilityLabel="Back to Settings"
        >
          <AppIcon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.heading}>Integrations</Text>
      </View>
      <Text style={styles.subheading}>
        Connect the marketplaces and services this workspace uses.
      </Text>

      {statusBanner ? (
        <View
          style={[
            styles.banner,
            statusBanner.kind === "success"
              ? styles.bannerSuccess
              : styles.bannerError,
          ]}
        >
          <AppIcon
            name={statusBanner.kind === "success"
              ? "checkmark-circle"
              : "warning-outline"}
            size={16}
            color={statusBanner.kind === "success"
              ? "#5EE8B7"
              : colors.danger}
          />
          <Text style={styles.bannerText}>{statusBanner.message}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.banner, styles.bannerError]}>
          <AppIcon name="warning-outline" size={16} color={colors.danger} />
          <Text style={styles.bannerText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {loading && integrations.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          PROVIDERS.map((provider) => {
            const integration = byProvider.get(provider.id);
            const metadata = (integration?.metadata ?? {}) as IntegrationMetadata;
            const status = statusFor(provider, integration);
            const isBusy = busyProvider === provider.id;

            return (
              <View key={provider.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <ProviderLogo
                    source={provider.logo}
                    wide={provider.logoWide}
                    label={provider.name}
                  />
                  <View style={styles.cardTitleWrap}>
                    <Text style={styles.cardTitle}>{provider.name}</Text>
                    <Text style={styles.cardDescription} numberOfLines={2}>
                      {provider.description}
                    </Text>
                  </View>
                  <StatusBadge status={status} />
                </View>

                {status === "connected" && metadata.account ? (
                  <View style={styles.metaRow}>
                    <AppIcon
                      name="person-circle-outline"
                      size={16}
                      color={colors.textMuted}
                    />
                    <Text style={styles.metaText}>{metadata.account}</Text>
                    {metadata.environment === "sandbox" ? (
                      <View style={styles.sandboxPill}>
                        <Text style={styles.sandboxPillText}>Sandbox</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {status === "connected" && metadata.access_expires_at ? (
                  <Text style={styles.metaSubText}>
                    Access token refreshes after{" "}
                    {new Date(metadata.access_expires_at).toLocaleString()}
                  </Text>
                ) : null}

                {status === "unavailable" && provider.unavailableNote ? (
                  <Text style={styles.metaSubText}>
                    {provider.unavailableNote}
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  {status === "connected" ? (
                    <Pressable
                      disabled={isBusy}
                      onPress={() =>
                        handleDisconnect(provider.id, metadata.account ?? null)}
                      style={({ pressed }) => [
                        styles.actionButton,
                        styles.actionButtonDanger,
                        pressed && styles.actionButtonPressed,
                      ]}
                    >
                      {isBusy ? (
                        <ActivityIndicator
                          size="small"
                          color={colors.danger}
                        />
                      ) : (
                        <>
                          <AppIcon
                            name="unlink-outline"
                            size={16}
                            color={colors.danger}
                          />
                          <Text style={styles.actionButtonDangerLabel}>
                            Disconnect
                          </Text>
                        </>
                      )}
                    </Pressable>
                  ) : status === "available" && provider.id === "ebay" ? (
                    <Pressable
                      disabled={isBusy || !orgId}
                      onPress={handleConnectEbay}
                      style={({ pressed }) => [
                        styles.actionButton,
                        styles.actionButtonPrimary,
                        pressed && styles.actionButtonPressed,
                      ]}
                    >
                      {isBusy ? (
                        <ActivityIndicator
                          size="small"
                          color={colors.text}
                        />
                      ) : (
                        <>
                          <AppIcon
                            name="log-in-outline"
                            size={16}
                            color={colors.text}
                          />
                          <Text style={styles.actionButtonPrimaryLabel}>
                            Connect
                          </Text>
                        </>
                      )}
                    </Pressable>
                  ) : (
                    <View
                      style={[styles.actionButton, styles.actionButtonGhost]}
                    >
                      <Text style={styles.actionButtonGhostLabel}>
                        Not yet available
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
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
  heading: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subheading: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  banner: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerSuccess: {
    backgroundColor: "rgba(94, 232, 183, 0.12)",
    borderColor: "rgba(94, 232, 183, 0.4)",
  },
  bannerError: {
    backgroundColor: "rgba(255, 92, 122, 0.14)",
    borderColor: "rgba(255, 92, 122, 0.4)",
  },
  bannerText: { color: colors.text, flex: 1, fontSize: 13 },
  scroll: { paddingBottom: 32, paddingTop: 16 },
  loading: {
    alignItems: "center",
    paddingVertical: 48,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 16,
    borderWidth: 1,
    elevation: 3,
    marginBottom: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
  },
  cardHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  logoWrap: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(0, 0, 0, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
    padding: 6,
    width: 44,
  },
  logoWrapWide: {
    paddingHorizontal: 8,
    width: 96,
  },
  logoImage: {
    height: "100%",
    width: "100%",
  },
  cardTitleWrap: { flex: 1, gap: 2 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cardDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeConnected: {
    backgroundColor: "rgba(94, 232, 183, 0.12)",
    borderColor: "rgba(94, 232, 183, 0.5)",
  },
  badgeAvailable: {
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
  },
  badgeUnavailable: {
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
    opacity: 0.7,
  },
  badgeLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
  badgeLabelConnected: {
    color: "#5EE8B7",
    fontSize: 11,
    fontWeight: "700",
  },
  badgeDotConnected: {
    backgroundColor: "#5EE8B7",
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },
  metaText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  metaSubText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  sandboxPill: {
    backgroundColor: "rgba(124, 92, 255, 0.16)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sandboxPillText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  actions: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionButton: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionButtonPrimary: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  actionButtonPrimaryLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  actionButtonDanger: {
    backgroundColor: "rgba(255, 92, 122, 0.12)",
    borderColor: "rgba(255, 92, 122, 0.4)",
    borderWidth: 1,
  },
  actionButtonDangerLabel: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  actionButtonGhost: {
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
  },
  actionButtonGhostLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  actionButtonPressed: { opacity: 0.7 },
});
