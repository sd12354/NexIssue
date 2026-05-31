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
  bootstrapEbayPolicies,
  connectShippo,
  disconnectIntegration,
  IntegrationError,
  listIntegrations,
  startEbayOAuth,
  testShippoIntegration,
  verifyEbayConnection,
  type EbayVerificationResult,
  type IntegrationMetadata,
  type IntegrationProvider,
  type IntegrationVerification,
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
  Modal,
  TextInput,
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
    available: true,
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

type IntegrationStatus =
  | "connected"
  | "needs_reconnect"
  | "check_failed"
  | "checking"
  | "available"
  | "unavailable";

function statusFor(
  provider: ProviderUi,
  integration: OrgIntegration | undefined,
  ebayVerification: IntegrationVerification | null,
  verifyingEbay: boolean,
): IntegrationStatus {
  if (integration) {
    if (provider.id === "ebay") {
      if (ebayVerification?.status === "needs_reconnect") return "needs_reconnect";
      if (ebayVerification?.status === "error") return "check_failed";
      if (verifyingEbay && !ebayVerification) return "checking";
    }
    return "connected";
  }
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
  if (status === "needs_reconnect") {
    return (
      <View style={[styles.badge, styles.badgeDanger]}>
        <Text style={styles.badgeLabelDanger}>Reconnect needed</Text>
      </View>
    );
  }
  if (status === "check_failed") {
    return (
      <View style={[styles.badge, styles.badgeWarning]}>
        <Text style={styles.badgeLabelWarning}>Check failed</Text>
      </View>
    );
  }
  if (status === "checking") {
    return (
      <View style={[styles.badge, styles.badgeAvailable]}>
        <Text style={styles.badgeLabel}>Checking…</Text>
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
  const [shippoModalOpen, setShippoModalOpen] = useState(false);
  const [shippoApiKey, setShippoApiKey] = useState("");
  const [useTestKeyHint, setUseTestKeyHint] = useState(false);
  const [ebayVerification, setEbayVerification] = useState<
    IntegrationVerification | null
  >(null);
  const [verifyingEbay, setVerifyingEbay] = useState(false);

  const byProvider = useMemo(() => {
    const map = new Map<IntegrationProvider, OrgIntegration>();
    for (const row of integrations) map.set(row.provider, row);
    return map;
  }, [integrations]);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listIntegrations(supabase, orgId);
      setIntegrations(rows);
      const ebayRow = rows.find((row) => row.provider === "ebay");
      setEbayVerification(ebayRow?.metadata?.verification ?? null);
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

  const applyVerificationResult = useCallback(
    (result: EbayVerificationResult, options: { silent?: boolean } = {}) => {
      const lastVerifiedAt = result.lastVerifiedAt ?? new Date().toISOString();
      const account =
        result.ok && result.account
          ? result.account
          : ebayVerification?.account ?? null;
      const next: IntegrationVerification = result.ok
        ? { status: "ok", last_verified_at: lastVerifiedAt, account }
        : {
            status:
              result.code === "needs_reconnect" ? "needs_reconnect" : "error",
            last_verified_at: lastVerifiedAt,
            account,
            error_code: result.code,
            error_message: result.message,
          };
      setEbayVerification(next);
      if (!options.silent) {
        if (result.ok) {
          setStatusBanner({
            kind: "success",
            message: account
              ? `eBay connection OK (${account}).`
              : "eBay connection OK.",
          });
        } else {
          setStatusBanner({ kind: "error", message: result.message });
        }
      }
    },
    [ebayVerification?.account],
  );

  const handleVerifyEbay = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (verifyingEbay) return;
      setVerifyingEbay(true);
      try {
        const result = await verifyEbayConnection(supabase);
        applyVerificationResult(result, options);
      } catch (err) {
        if (!options.silent) {
          setStatusBanner({
            kind: "error",
            message: err instanceof IntegrationError
              ? err.message
              : "Could not verify eBay connection.",
          });
        }
      } finally {
        setVerifyingEbay(false);
      }
    },
    [verifyingEbay, applyVerificationResult],
  );

  const hasEbay = byProvider.has("ebay");
  useEffect(() => {
    if (!hasEbay) return;
    void handleVerifyEbay({ silent: true });
    // Trigger once whenever an eBay integration appears in this session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEbay]);

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
          try {
            const bootstrap = await bootstrapEbayPolicies(supabase);
            setStatusBanner({
              kind: "success",
              message: bootstrap.created
                ? "Default policies created — you can customize in eBay Seller Hub."
                : bootstrap.message,
            });
          } catch (bootstrapErr) {
            setStatusBanner({
              kind: "success",
              message: params.account
                ? `Connected to eBay as ${params.account}.`
                : "eBay connected.",
            });
            console.warn("eBay policy bootstrap failed", bootstrapErr);
          }
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

  const handleConnectShippo = useCallback(async () => {
    if (!orgId || busyProvider) return;
    const key = shippoApiKey.trim();
    if (!key) {
      setStatusBanner({
        kind: "error",
        message: "Enter your Shippo API key.",
      });
      return;
    }

    setBusyProvider("shippo");
    setStatusBanner(null);
    try {
      const result = await connectShippo(supabase, key);
      setShippoModalOpen(false);
      setShippoApiKey("");
      setStatusBanner({
        kind: "success",
        message: result.testMode
          ? `Connected to Shippo (test mode) as ${result.account}.`
          : `Connected to Shippo as ${result.account}.`,
      });
      await refresh();
    } catch (err) {
      setStatusBanner({
        kind: "error",
        message: err instanceof IntegrationError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Invalid API key — check and try again.",
      });
    } finally {
      setBusyProvider(null);
    }
  }, [orgId, busyProvider, refresh, shippoApiKey]);

  const handleTestShippo = useCallback(async () => {
    if (!orgId || busyProvider) return;
    setBusyProvider("shippo");
    setStatusBanner(null);
    try {
      const result = await testShippoIntegration(supabase);
      setStatusBanner({
        kind: "success",
        message: `Shippo connection OK (${result.account}).`,
      });
    } catch (err) {
      setStatusBanner({
        kind: "error",
        message: err instanceof IntegrationError
          ? err.message
          : "Connection test failed.",
      });
    } finally {
      setBusyProvider(null);
    }
  }, [orgId, busyProvider]);

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
            const status = statusFor(
              provider,
              integration,
              provider.id === "ebay" ? ebayVerification : null,
              provider.id === "ebay" ? verifyingEbay : false,
            );
            const isBusy = busyProvider === provider.id;
            const isEbay = provider.id === "ebay";
            const needsReconnect = isEbay && status === "needs_reconnect";
            const checkFailed = isEbay && status === "check_failed";

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
                    {metadata.test_mode ? (
                      <View style={styles.sandboxPill}>
                        <Text style={styles.sandboxPillText}>Test key</Text>
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

                {isEbay && ebayVerification?.last_verified_at ? (
                  <Text style={styles.metaSubText}>
                    Last checked:{" "}
                    {new Date(ebayVerification.last_verified_at).toLocaleString()}
                  </Text>
                ) : null}

                {isEbay && (needsReconnect || checkFailed) ? (
                  <Text
                    style={[
                      styles.metaSubText,
                      { color: needsReconnect ? colors.danger : "#F0B86E" },
                    ]}
                  >
                    {ebayVerification?.error_message ?? "eBay check failed."}
                  </Text>
                ) : null}

                {status === "unavailable" && provider.unavailableNote ? (
                  <Text style={styles.metaSubText}>
                    {provider.unavailableNote}
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  {(status === "connected" ||
                    status === "needs_reconnect" ||
                    status === "check_failed" ||
                    status === "checking") ? (
                    <>
                      {isEbay ? (
                        <Pressable
                          disabled={verifyingEbay}
                          onPress={() => void handleVerifyEbay()}
                          style={({ pressed }) => [
                            styles.actionButton,
                            styles.actionButtonGhost,
                            pressed && styles.actionButtonPressed,
                          ]}
                        >
                          {verifyingEbay ? (
                            <ActivityIndicator size="small" color={colors.accent} />
                          ) : (
                            <Text style={styles.actionButtonGhostLabel}>
                              Test connection
                            </Text>
                          )}
                        </Pressable>
                      ) : null}
                      {isEbay && (needsReconnect || checkFailed) ? (
                        <Pressable
                          disabled={isBusy}
                          onPress={() => void handleConnectEbay()}
                          style={({ pressed }) => [
                            styles.actionButton,
                            styles.actionButtonPrimary,
                            pressed && styles.actionButtonPressed,
                          ]}
                        >
                          <Text style={styles.actionButtonPrimaryLabel}>
                            Reconnect
                          </Text>
                        </Pressable>
                      ) : null}
                      {provider.id === "shippo" ? (
                        <Pressable
                          disabled={isBusy}
                          onPress={() => void handleTestShippo()}
                          style={({ pressed }) => [
                            styles.actionButton,
                            styles.actionButtonGhost,
                            pressed && styles.actionButtonPressed,
                          ]}
                        >
                          <Text style={styles.actionButtonGhostLabel}>
                            Test connection
                          </Text>
                        </Pressable>
                      ) : null}
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
                    </>
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
                  ) : status === "available" && provider.id === "shippo" ? (
                    <Pressable
                      disabled={isBusy || !orgId}
                      onPress={() => {
                        setShippoApiKey("");
                        setUseTestKeyHint(false);
                        setShippoModalOpen(true);
                      }}
                      style={({ pressed }) => [
                        styles.actionButton,
                        styles.actionButtonPrimary,
                        pressed && styles.actionButtonPressed,
                      ]}
                    >
                      <Text style={styles.actionButtonPrimaryLabel}>
                        Connect Shippo
                      </Text>
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

      <Modal visible={shippoModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter Shippo API key</Text>
            <TextInput
              value={shippoApiKey}
              onChangeText={setShippoApiKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={useTestKeyHint ? "shippo_test_..." : "Shippo API key"}
              placeholderTextColor={colors.textMuted}
              style={styles.modalInput}
            />
            <Pressable
              onPress={() =>
                void Linking.openURL("https://app.goshippo.com/settings/api")}
            >
              <Text style={styles.modalLink}>Where do I find this?</Text>
            </Pressable>
            <Pressable
              onPress={() => setUseTestKeyHint((value) => !value)}
              style={styles.testKeyRow}
            >
              <AppIcon
                name={useTestKeyHint ? "checkbox" : "square-outline"}
                size={18}
                color={colors.accent}
              />
              <Text style={styles.testKeyLabel}>
                Use test key (starts with shippo_test_)
              </Text>
            </Pressable>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setShippoModalOpen(false)}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={busyProvider === "shippo"}
                onPress={() => void handleConnectShippo()}
                style={styles.modalConnect}
              >
                {busyProvider === "shippo" ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.modalConnectText}>Connect</Text>
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
  badgeDanger: {
    backgroundColor: "rgba(255, 95, 109, 0.12)",
    borderColor: "rgba(255, 95, 109, 0.5)",
  },
  badgeLabelDanger: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: "700",
  },
  badgeWarning: {
    backgroundColor: "rgba(240, 184, 110, 0.12)",
    borderColor: "rgba(240, 184, 110, 0.5)",
  },
  badgeLabelWarning: {
    color: "#F0B86E",
    fontSize: 11,
    fontWeight: "700",
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
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  modalInput: {
    backgroundColor: colors.background,
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalLink: { color: colors.accent, fontSize: 13, marginTop: 10 },
  testKeyRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  testKeyLabel: { color: colors.textMuted, fontSize: 13 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 16 },
  modalCancel: {
    alignItems: "center",
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  modalCancelText: { color: colors.textMuted, fontWeight: "600" },
  modalConnect: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    flex: 1,
    paddingVertical: 12,
  },
  modalConnectText: { color: colors.text, fontWeight: "700" },
});
