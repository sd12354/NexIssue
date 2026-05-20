import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "../components/AppIcon";
import { LoadingSplash } from "../components/LoadingSplash";
import { MainTabBar } from "../components/MainTabBar";
import { useAuth } from "../contexts/AuthContext";
import { CatalogProvider } from "../contexts/CatalogContext";
import { CatalogScreen } from "../screens/CatalogScreen";
import { CertConfirmScreen } from "../screens/CertConfirmScreen";
import { CoverCaptureScreen } from "../screens/CoverCaptureScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LabelCaptureScreen } from "../screens/LabelCaptureScreen";
import { PlaceholderScreen } from "../screens/PlaceholderScreen";
import { ScannerScreen } from "../screens/ScannerScreen";
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

function MainContent({
  tab,
  onScanTab,
}: {
  tab: MainTab;
  onScanTab: () => void;
}) {
  switch (tab) {
    case "Home":
      return <HomeScreen />;
    case "Catalog":
      return <CatalogScreen onAdd={onScanTab} />;
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
        <PlaceholderScreen
          icon={screenHeroIcons.Settings}
          title="Settings"
          description="Org, integrations, and rules will live here."
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
  const insets = useSafeAreaInsets();
  const isScanFlow = tab === "Scan";
  const title = tab === "Home" ? "NexIssue" : tab;
  const headerIcon = headerIcons[tab];

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
          <MainContent tab={tab} onScanTab={() => setTab("Scan")} />
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
