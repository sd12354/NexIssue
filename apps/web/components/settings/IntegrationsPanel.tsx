"use client";

import {
  bootstrapEbayPolicies,
  connectShippo,
  disconnectIntegration,
  getCurrentOrg,
  IntegrationError,
  listIntegrations,
  startEbayOAuth,
  testShippoIntegration,
  verifyEbayConnection,
  type EbayVerificationResult,
  type IntegrationProvider,
  type IntegrationVerification,
  type OrgIntegration,
} from "@app/api";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { useAuth } from "../../contexts/AuthProvider";
import { useCatalog } from "../../contexts/CatalogProvider";
import { getSupabase } from "../../lib/supabase";

type ProviderUi = {
  id: IntegrationProvider;
  name: string;
  description: string;
  logo: string;
  logoWide?: boolean;
  available: boolean;
  unavailableNote?: string;
};

const PROVIDERS: ReadonlyArray<ProviderUi> = [
  {
    id: "ebay",
    name: "eBay",
    description: "Marketplace listing and sales.",
    logo: "/integrations/ebay-logo.png",
    available: true,
  },
  {
    id: "shippo",
    name: "Shippo",
    description: "Shipping labels and tracking.",
    logo: "/integrations/shippo-logo.png",
    available: true,
  },
  {
    id: "gocollect",
    name: "GoCollect",
    description: "Market data and pricing comps.",
    logo: "/integrations/gocollect-logo.png",
    logoWide: true,
    available: false,
    unavailableNote: "Coming with Pricing Intelligence (Phase 2).",
  },
];

function webReturnUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/settings?tab=integrations`;
}

function optimisticEbayIntegration(
  orgId: string,
  account: string,
  environment: string | null,
): OrgIntegration {
  const now = new Date().toISOString();
  return {
    id: "optimistic-ebay",
    org_id: orgId,
    provider: "ebay",
    metadata: {
      account,
      environment: environment === "sandbox" ? "sandbox" : "production",
    },
    connected_at: now,
    last_used_at: now,
    created_at: now,
    updated_at: now,
  };
}

export function IntegrationsPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { orgId } = useCatalog();
  const [integrations, setIntegrations] = useState<OrgIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<IntegrationProvider | null>(
    null,
  );
  const [banner, setBanner] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [shippoKey, setShippoKey] = useState("");
  const [showShippoForm, setShowShippoForm] = useState(false);
  const [ebayVerification, setEbayVerification] = useState<
    IntegrationVerification | null
  >(null);
  const [verifyingEbay, setVerifyingEbay] = useState(false);

  const byProvider = useMemo(() => {
    const map = new Map<IntegrationProvider, OrgIntegration>();
    for (const row of integrations) map.set(row.provider, row);
    return map;
  }, [integrations]);

  const loadIntegrations = useCallback(async (targetOrgId: string) => {
    const rows = await listIntegrations(getSupabase(), targetOrgId);
    setIntegrations(rows);
    const ebayRow = rows.find((row) => row.provider === "ebay");
    setEbayVerification(ebayRow?.metadata?.verification ?? null);
    return rows;
  }, []);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      await loadIntegrations(orgId);
    } finally {
      setLoading(false);
    }
  }, [orgId, loadIntegrations]);

  useEffect(() => {
    if (!orgId) return;
    void refresh();
  }, [orgId, refresh]);

  useEffect(() => {
    if (!searchParams) return;

    const status = searchParams.get("status");
    if (!status || !user) return;

    const account = searchParams.get("account");
    const environment = searchParams.get("environment");
    const errorMessage = searchParams.get("error_message");

    const clearOAuthParams = () => {
      router.replace("/settings?tab=integrations");
    };

    const finish = async () => {
      const supabase = getSupabase();
      const orgResult = await getCurrentOrg(supabase, user.id);
      const currentOrgId = orgResult?.organization.id ?? orgId;

      if (status === "success" && account && currentOrgId) {
        setIntegrations((prev) => {
          const rest = prev.filter((row) => row.provider !== "ebay");
          return [
            ...rest,
            optimisticEbayIntegration(currentOrgId, account, environment),
          ];
        });
      }

      if (status === "success") {
        try {
          const bootstrap = await bootstrapEbayPolicies(supabase);
          setBanner({
            kind: "success",
            message: bootstrap.created
              ? "Default policies created — you can customize in eBay Seller Hub."
              : bootstrap.message,
          });
        } catch {
          setBanner({
            kind: "success",
            message: account
              ? `Connected to eBay as ${account}.`
              : "eBay connected.",
          });
        }
      } else {
        setBanner({
          kind: "error",
          message: errorMessage ?? "eBay connection failed.",
        });
      }

      clearOAuthParams();

      if (currentOrgId) {
        setLoading(true);
        try {
          await loadIntegrations(currentOrgId);
        } finally {
          setLoading(false);
        }
      }
    };

    void finish();
  }, [searchParams, user, orgId, router, loadIntegrations]);

  const handleConnectEbay = async () => {
    if (!orgId || busyProvider) return;
    setBusyProvider("ebay");
    setBanner(null);
    try {
      const start = await startEbayOAuth(getSupabase(), {
        returnScheme: webReturnUrl(),
      });
      window.location.href = start.authorizeUrl;
    } catch (err) {
      setBanner({
        kind: "error",
        message:
          err instanceof IntegrationError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Could not start eBay OAuth.",
      });
      setBusyProvider(null);
    }
  };

  const handleConnectShippo = async () => {
    if (!orgId || busyProvider) return;
    const key = shippoKey.trim();
    if (!key) {
      setBanner({ kind: "error", message: "Enter your Shippo API key." });
      return;
    }
    setBusyProvider("shippo");
    setBanner(null);
    try {
      const result = await connectShippo(getSupabase(), key);
      setShowShippoForm(false);
      setShippoKey("");
      setBanner({
        kind: "success",
        message: result.testMode
          ? `Connected to Shippo (test mode) as ${result.account}.`
          : `Connected to Shippo as ${result.account}.`,
      });
      await refresh();
    } catch (err) {
      setBanner({
        kind: "error",
        message:
          err instanceof IntegrationError
            ? err.message
            : "Invalid API key — check and try again.",
      });
    } finally {
      setBusyProvider(null);
    }
  };

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
            status: result.code === "needs_reconnect" ? "needs_reconnect" : "error",
            last_verified_at: lastVerifiedAt,
            account,
            error_code: result.code,
            error_message: result.message,
          };
      setEbayVerification(next);
      if (!options.silent) {
        if (result.ok) {
          setBanner({
            kind: "success",
            message: account
              ? `eBay connection OK (${account}).`
              : "eBay connection OK.",
          });
        } else {
          setBanner({ kind: "error", message: result.message });
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
        const result = await verifyEbayConnection(getSupabase());
        applyVerificationResult(result, options);
      } catch (err) {
        if (!options.silent) {
          setBanner({
            kind: "error",
            message:
              err instanceof IntegrationError
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
    // Run once per page-load whenever an eBay row appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEbay]);

  const handleTestShippo = async () => {
    if (!orgId || busyProvider) return;
    setBusyProvider("shippo");
    try {
      const result = await testShippoIntegration(getSupabase());
      setBanner({
        kind: "success",
        message: `Shippo connection OK (${result.account}).`,
      });
    } catch (err) {
      setBanner({
        kind: "error",
        message:
          err instanceof IntegrationError
            ? err.message
            : "Connection test failed.",
      });
    } finally {
      setBusyProvider(null);
    }
  };

  const handleDisconnect = async (
    provider: IntegrationProvider,
    label: string | null,
  ) => {
    if (!orgId) return;
    if (
      !confirm(
        label
          ? `Disconnect ${provider} (${label})?`
          : `Disconnect ${provider}?`,
      )
    ) {
      return;
    }
    setBusyProvider(provider);
    try {
      await disconnectIntegration(getSupabase(), orgId, provider);
      await refresh();
    } finally {
      setBusyProvider(null);
    }
  };

  if (loading && integrations.length === 0) {
    return <p className="text-sm text-muted">Loading integrations…</p>;
  }

  return (
    <div className="space-y-4">
      {banner ? (
        <div
          className={`rounded-card border px-4 py-3 text-sm ${
            banner.kind === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      {PROVIDERS.map((provider) => {
        const integration = byProvider.get(provider.id);
        const connected = !!integration;
        const account =
          typeof integration?.metadata?.account === "string"
            ? integration.metadata.account
            : null;

        const isEbay = provider.id === "ebay";
        const verification = isEbay ? ebayVerification : null;
        const needsReconnect =
          isEbay && verification?.status === "needs_reconnect";
        const verifyErrored = isEbay && verification?.status === "error";
        const verifyOk = isEbay && verification?.status === "ok";

        const statusPill = !connected
          ? provider.available
            ? { label: "Not connected", tone: "muted" as const }
            : { label: "Coming soon", tone: "muted" as const }
          : needsReconnect
            ? { label: "Reconnect needed", tone: "danger" as const }
            : verifyErrored
              ? { label: "Check failed", tone: "warning" as const }
              : verifyingEbay && isEbay && !verification
                ? { label: "Checking…", tone: "muted" as const }
                : { label: "Connected", tone: "ok" as const };

        const pillClass =
          statusPill.tone === "ok"
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
            : statusPill.tone === "danger"
              ? "border-danger/40 bg-danger/15 text-danger"
              : statusPill.tone === "warning"
                ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                : "border-surface-border text-muted";

        return (
          <Card key={provider.id} className="p-4">
            <div className="flex flex-wrap items-start gap-4">
              <div
                className={`flex h-12 items-center justify-center rounded-lg border border-surface-border bg-white px-3 ${
                  provider.logoWide ? "min-w-[120px]" : "w-12"
                }`}
              >
                <Image
                  src={provider.logo}
                  alt={`${provider.name} logo`}
                  width={provider.logoWide ? 100 : 32}
                  height={32}
                  className="max-h-8 w-auto object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-foreground">
                    {provider.name}
                  </h3>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${pillClass}`}
                  >
                    {statusPill.label}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{provider.description}</p>
                {provider.unavailableNote ? (
                  <p className="mt-1 text-xs text-muted">
                    {provider.unavailableNote}
                  </p>
                ) : null}
                {account ? (
                  <p className="mt-2 text-xs text-muted">
                    Connected account: {account}
                  </p>
                ) : null}
                {isEbay && connected && verification?.last_verified_at ? (
                  <p className="mt-1 text-xs text-muted">
                    Last checked:{" "}
                    {new Date(verification.last_verified_at).toLocaleString()}
                  </p>
                ) : null}
                {isEbay && (needsReconnect || verifyErrored) ? (
                  <p
                    className={`mt-2 text-xs ${
                      needsReconnect ? "text-danger" : "text-amber-300"
                    }`}
                  >
                    {verification?.error_message ?? "eBay check failed."}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {connected ? (
                  <>
                    {isEbay ? (
                      <>
                        <Button
                          variant="secondary"
                          disabled={verifyingEbay || busyProvider === provider.id}
                          onClick={() => void handleVerifyEbay()}
                        >
                          {verifyingEbay ? "Checking…" : "Test connection"}
                        </Button>
                        {needsReconnect || verifyErrored ? (
                          <Button
                            disabled={busyProvider === provider.id}
                            onClick={() => void handleConnectEbay()}
                          >
                            Reconnect
                          </Button>
                        ) : null}
                      </>
                    ) : provider.id === "shippo" ? (
                      <Button
                        variant="secondary"
                        disabled={busyProvider === provider.id}
                        onClick={() => void handleTestShippo()}
                      >
                        Test connection
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      disabled={busyProvider === provider.id}
                      onClick={() =>
                        void handleDisconnect(provider.id, account)
                      }
                    >
                      Disconnect
                    </Button>
                  </>
                ) : provider.available && provider.id === "ebay" ? (
                  <Button
                    disabled={busyProvider === provider.id}
                    onClick={() => void handleConnectEbay()}
                  >
                    Connect
                  </Button>
                ) : provider.available && provider.id === "shippo" ? (
                  <Button
                    disabled={busyProvider === provider.id}
                    onClick={() => setShowShippoForm(true)}
                  >
                    Connect Shippo
                  </Button>
                ) : provider.available ? (
                  <Button disabled>Connect</Button>
                ) : (
                  <Button variant="secondary" disabled>
                    Not yet available
                  </Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {showShippoForm ? (
        <Card className="p-4">
          <h3 className="font-semibold text-foreground">Enter Shippo API key</h3>
          <input
            type="password"
            className="mt-3 w-full rounded-lg border border-surface-border bg-input px-3 py-2"
            placeholder="shippo_test_… or live key"
            value={shippoKey}
            onChange={(event) => setShippoKey(event.target.value)}
          />
          <p className="mt-2 text-xs text-muted">
            Find keys at{" "}
            <a
              className="text-accent underline"
              href="https://app.goshippo.com/settings/api"
              target="_blank"
              rel="noreferrer"
            >
              app.goshippo.com/settings/api
            </a>
            . Test keys start with <code>shippo_test_</code>.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              disabled={busyProvider === "shippo"}
              onClick={() => void handleConnectShippo()}
            >
              Connect
            </Button>
            <Button variant="secondary" onClick={() => setShowShippoForm(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
