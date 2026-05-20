import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "../components/AppIcon";
import { LabelGuideOverlay } from "../components/LabelGuideOverlay";
import type { Grader } from "../lib/cert";
import { runLabelOcr } from "../lib/labelOcr";
import type { CertConfirmParams } from "../lib/labelTypes";
import { colors } from "../theme/colors";

type LabelCaptureScreenProps = {
  grader: Grader;
  certNumber: string;
  onComplete: (params: CertConfirmParams) => void;
  onBack: () => void;
};

export function LabelCaptureScreen({
  grader,
  certNumber,
  onComplete,
  onBack,
}: LabelCaptureScreenProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = async () => {
    if (!cameraRef.current || processing) return;
    setError(null);
    setProcessing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        throw new Error("Could not capture photo");
      }

      const parsed = await runLabelOcr(photo.uri);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      onComplete({
        grader,
        certNumber,
        label: parsed.fields,
        rawOcrText: parsed.rawText,
        ocrConfidence: parsed.confidence,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "OCR failed. Try again or enter manually.",
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setProcessing(false);
    }
  };

  const handleSkipManual = () => {
    onComplete({ grader, certNumber, ocrConfidence: "low" });
  };

  if (!permission?.granted) {
    return (
      <View style={[styles.permission, { paddingTop: insets.top + 24 }]}>
        <AppIcon name="camera-outline" size={48} color={colors.accent} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          We need the camera to photograph the printed label on your slab.
        </Text>
        <Pressable onPress={requestPermission} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>Allow camera</Text>
        </Pressable>
        <Pressable onPress={handleSkipManual}>
          <Text style={styles.link}>Enter details manually</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <LabelGuideOverlay hint="Hold the slab horizontally and frame the yellow CGC label inside the box" />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} style={styles.back} disabled={processing}>
          <AppIcon name="chevron-back" size={24} color={colors.text} />
          <Text style={styles.backLabel}>Rescan QR</Text>
        </Pressable>
        <View style={styles.certPill}>
          <Text style={styles.certPillText}>
            {grader} · {certNumber}
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {processing ? (
          <View style={styles.processing}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.processingText}>Reading label…</Text>
          </View>
        ) : (
          <>
            <Pressable onPress={handleCapture} style={styles.captureOuter}>
              <View style={styles.captureInner} />
            </Pressable>
            <Text style={styles.captureHint}>Capture label text</Text>
            <Pressable onPress={handleSkipManual}>
              <Text style={styles.link}>Enter details manually</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000",
    flex: 1,
  },
  permission: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: 16,
    paddingHorizontal: 28,
  },
  permissionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
  permissionBody: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  topBar: {
    gap: 12,
    paddingHorizontal: 16,
    zIndex: 2,
  },
  back: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 4,
  },
  backLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "500",
  },
  certPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  certPillText: {
    color: colors.text,
    fontFamily: "Menlo",
    fontSize: 13,
    fontWeight: "600",
  },
  footer: {
    alignItems: "center",
    bottom: 0,
    gap: 12,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 2,
  },
  captureOuter: {
    alignItems: "center",
    borderColor: colors.text,
    borderRadius: 40,
    borderWidth: 4,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  captureInner: {
    backgroundColor: colors.text,
    borderRadius: 28,
    height: 56,
    width: 56,
  },
  captureHint: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  link: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "600",
  },
  processing: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  processingText: {
    color: colors.text,
    fontSize: 15,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  primaryLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
});
