import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "../components/AppIcon";
import { LoadingSplash } from "../components/LoadingSplash";
import { MainTabBar } from "../components/MainTabBar";
import { useAuth } from "../contexts/AuthContext";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { CatalogProvider } from "../contexts/CatalogContext";
import { CatalogScreen } from "../screens/CatalogScreen";
import { CertConfirmScreen } from "../screens/CertConfirmScreen";
import { CoverCaptureScreen } from "../screens/CoverCaptureScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { IntegrationsScreen } from "../screens/IntegrationsScreen";
import { LabelCaptureScreen } from "../screens/LabelCaptureScreen";
import { PlaceholderScreen } from "../screens/PlaceholderScreen";
import { SaleDetailScreen } from "../screens/SaleDetailScreen";
import { ScannerScreen } from "../screens/ScannerScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { ShippingAddressScreen } from "../screens/ShippingAddressScreen";
import { ShippingPresetsScreen } from "../screens/ShippingPresetsScreen";
import { SignInScreen } from "../screens/SignInScreen";
import { SignUpScreen } from "../screens/SignUpScreen";
import { colors } from "../theme/colors";
import { headerIcons, screenHeroIcons } from "../theme/icons";
import type {
  AuthScreen,
  CertConfirmParams,
  MainTab,
  ScanStep,
} from "./types";

type SettingsRoute = "root" | "integrations" | "shipping" | "shipping-presets";

function SettingsStack({
  route,
  onRouteChange,
}: {
  route: SettingsRoute;
  onRouteChange: (route: SettingsRoute) => void;
}) {
  if (route === "integrations") {
    return <IntegrationsScreen onBack={() => onRouteChange("root")} />;
  }
  if (route === "shipping-presets") {
    return (
      <ShippingPresetsScreen onBack={() => onRouteChange("shipping")} />
    );
  }
  if (route === "shipping") {
    return (
      <ShippingAddressScreen
        onBack={() => onRouteChange("root")}
        onOpenPresets={() => onRouteChange("shipping-presets")}
      />
    );
  }
  return (
    <SettingsScreen
      onOpenIntegrations={() => onRouteChange("integrations")}
      onOpenShipping={() => onRouteChange("shipping")}
    />
  );
}

function MainContent({
  tab,
  onScanTab,
  settingsRoute,
  onSettingsRouteChange,
  onOpenIntegrations,
  onOpenSale,
  onOpenShippingSettings,
}: {
  tab: MainTab;
  onScanTab: () => void;
  settingsRoute: SettingsRoute;
  onSettingsRouteChange: (route: SettingsRoute) => void;
  onOpenIntegrations: () => void;
  onOpenSale: (saleId: string) => void;
  onOpenShippingSettings: () => void;
}) {
  switch (tab) {
    case "Home":
      return (
        <HomeScreen
          onOpenSale={onOpenSale}
          onOpenShippingSettings={onOpenShippingSettings}
        />
      );
    case "Catalog":
      return (
        <CatalogScreen onAdd={onScanTab} onOpenIntegrations={onOpenIntegrations} />
      );
    case "Advisor":
      return (
        <PlaceholderScreen
          icon={screenHeroIcons.Advisor}
          title="Advisor"
          description="Buy / sell / hold recommendations come in Phase 5."
        />
      );
    case "Settings":
      return (
        <SettingsStack
          route={settingsRoute}
          onRouteChange={onSettingsRouteChange}
        />
      );
    default:
      return null;
  }
}

function ScanFlow({ onFinishedSave }: { onFinishedSave: () => void }) {
  const [step, setStep] = useState<ScanStep>("qr");
  const [certDraft, setCertDraft] = useState<{
    grader: CertConfirmParams["grader"];
    certNumber: string;
  } | null>(null);
  const [labelParams, setLabelParams] = useState<CertConfirmParams | null>(null);

  if (step === "qr") {
    return (
      <ScannerScreen
        onContinueToLabel={(draft) => {
          setCertDraft(draft);
          setStep("label");
        }}
      />
    );
  }

  if (step === "label" && certDraft) {
    return (
      <LabelCaptureScreen
        certNumber={certDraft.certNumber}
        grader={certDraft.grader}
        onBack={() => {
          setCertDraft(null);
          setStep("qr");
        }}
        onComplete={(params) => {
          setLabelParams(params);
          setStep("covers");
        }}
      />
    );
  }

  if (step === "covers" && certDraft && labelParams) {
    return (
      <CoverCaptureScreen
        grader={certDraft.grader}
        certNumber={certDraft.certNumber}
        onBack={() => setStep("label")}
        onComplete={({ front, back }) => {
          setLabelParams({
            ...labelParams,
            covers: {
              front: {
                uri: front.uploadUri,
                contentType: front.contentType,
                extension: front.extension,
                backgroundRemoved: front.backgroundRemoved,
              },
              back: {
                uri: back.uploadUri,
                contentType: back.contentType,
                extension: back.extension,
                backgroundRemoved: back.backgroundRemoved,
              },
            },
          });
          setStep("confirm");
        }}
      />
    );
  }

  if (step === "confirm" && labelParams) {
    return (
      <CertConfirmScreen
        params={labelParams}
        onBack={() => setStep("covers")}
        onSaved={() => {
          setCertDraft(null);
          setLabelParams(null);
          setStep("qr");
          onFinishedSave();
        }}
      />
    );
  }

  return null;
}

function MainShell() {
  const [tab, setTab] = useState<MainTab>("Home");
  const [settingsRoute, setSettingsRoute] = useState<SettingsRoute>("root");
  const [viewingSaleId, setViewingSaleId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  usePushNotifications();
  const isScanFlow = tab === "Scan";
  const title = tab === "Home" ? "NexIssue" : tab;
  const headerIcon = headerIcons[tab];

  const openIntegrations = () => {
    setTab("Settings");
    setSettingsRoute("integrations");
  };

  const openShippingSettings = () => {
    setTab("Settings");
    setSettingsRoute("shipping");
  };

  if (viewingSaleId) {
    return (
      <View style={styles.shell}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <AppIcon name={headerIcons.Home} size={22} color={colors.text} />
          <Text style={styles.headerTitle}>Sale</Text>
        </View>
        <View style={styles.content}>
          <SaleDetailScreen
            saleId={viewingSaleId}
            onBack={() => setViewingSaleId(null)}
          />
        </View>
        <MainTabBar active={tab} onChange={setTab} />
      </View>
    );
  }

  return (
    <View style={styles.shell}>
      {!isScanFlow ? (
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          {tab === "Home" ? (
            <Image
              accessibilityLabel="NexIssue"
              source={require("../../assets/logo.png")}
              style={styles.headerLogo}
            />
          ) : (
            <AppIcon name={headerIcon} size={22} color={colors.text} />
          )}
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
      ) : null}

      <View style={[styles.content, isScanFlow && styles.contentFullBleed]}>
        {isScanFlow ? (
          <ScanFlow
            key="scan-flow"
            onFinishedSave={() => setTab("Catalog")}
          />
        ) : (
          <MainContent
            tab={tab}
            onScanTab={() => setTab("Scan")}
            settingsRoute={settingsRoute}
            onSettingsRouteChange={setSettingsRoute}
            onOpenIntegrations={openIntegrations}
            onOpenSale={setViewingSaleId}
            onOpenShippingSettings={openShippingSettings}
          />
        )}
      </View>

      <MainTabBar active={tab} onChange={setTab} />
    </View>
  );
}

export function RootNavigator() {
  const { session, loading } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>("signIn");

  if (loading) {
    return <LoadingSplash />;
  }

  if (!session) {
    return authScreen === "signIn" ? (
      <SignInScreen onGoToSignUp={() => setAuthScreen("signUp")} />
    ) : (
      <SignUpScreen onGoToSignIn={() => setAuthScreen("signIn")} />
    );
  }

  return (
    <CatalogProvider>
      <MainShell />
    </CatalogProvider>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderBottomColor: colors.surfaceBorder,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 20,
  },
  headerLogo: {
    height: 28,
    resizeMode: "contain",
    width: 28,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "600",
  },
  content: {
    flex: 1,
  },
  contentFullBleed: {
    backgroundColor: "#000",
  },
});
