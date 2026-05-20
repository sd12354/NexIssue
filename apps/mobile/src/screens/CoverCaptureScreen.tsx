import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "../components/AppIcon";
import type { Grader } from "../lib/cert";
import {
  prepareCoverForUpload,
  type PreparedCoverPhoto,
} from "../lib/coverPipeline";
import { isVisionMaskSupported } from "expo-vision-mask";
import { colors } from "../theme/colors";

export type CoverPosition = "front" | "back";

export type CoverCaptureScreenProps = {
  grader: Grader;
  certNumber: string;
  onBack: () => void;
  onComplete: (covers: {
    front: PreparedCoverPhoto;
    back: PreparedCoverPhoto;
  }) => void;
};

type Step = "front" | "back" | "review";

const HINT: Record<CoverPosition, string> = {
  front: "Lay the slab flat. Frame the FRONT cover inside the box.",
  back: "Flip the slab over. Frame the BACK cover inside the box.",
};

export function CoverCaptureScreen({
  grader,
  certNumber,
  onBack,
  onComplete,
}: CoverCaptureScreenProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>("front");
  const [front, setFront] = useState<PreparedCoverPhoto | null>(null);
  const [back, setBack] = useState<PreparedCoverPhoto | null>(null);
  const [processing, setProcessing] = useState<{
    label: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visionLinked = isVisionMaskSupported();

  const handleCapture = async () => {
    if (!cameraRef.current || processing) return;
    setError(null);
    setProcessing({ label: "Capturing photo…" });
    try {
      const shot = await cameraRef.current.takePictureAsync({
        quality: 0.92,
        skipProcessing: false,
      });
      if (!shot?.uri) throw new Error("Could not capture photo");

      setProcessing({ label: "Cutting out background…" });
      const prepared = await prepareCoverForUpload(shot.uri);

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (step === "front") {
        setFront(prepared);
        setStep("back");
      } else if (step === "back") {
        setBack(prepared);
        setStep("review");
      }
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(
        err instanceof Error
          ? err.message
          : "Photo processing failed. Please try again.",
      );
    } finally {
      setProcessing(null);
    }
  };

  const retakeFront = () => {
    setFront(null);
    setStep("front");
  };

  const retakeBack = () => {
    setBack(null);
    setStep("back");
  };

  if (!permission?.granted) {
    return (
      <View style={[styles.permission, { paddingTop: insets.top + 24 }]}>
        <AppIcon name="camera-outline" size={48} color={colors.accent} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          We use the camera to photograph the front and back covers so we can
          remove the background for clean listing photos.
        </Text>
        <Pressable onPress={requestPermission} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  if (step === "review" && front && back) {
    return (
      <View style={[styles.reviewContainer, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={onBack} style={styles.backButton}>
          <AppIcon name="chevron-back" size={24} color={colors.text} />
          <Text style={styles.backLabel}>Back to label</Text>
        </Pressable>

        <Text style={styles.reviewTitle}>Cover photos ready</Text>
        <Text style={styles.reviewSubtitle}>
          {grader} · {certNumber}
        </Text>

        <BgStatusBanner front={front} back={back} />

        <View style={styles.previewRow}>
          <CoverPreview
            label="Front"
            uri={front.previewUri}
            removedBg={front.backgroundRemoved}
            fallbackReason={front.fallbackReason}
            onRetake={retakeFront}
          />
          <CoverPreview
            label="Back"
            uri={back.previewUri}
            removedBg={back.backgroundRemoved}
            fallbackReason={back.fallbackReason}
            onRetake={retakeBack}
          />
        </View>

        <Pressable
          onPress={() => onComplete({ front, back })}
          style={[styles.primaryButton, { marginTop: 16 }]}
        >
          <Text style={styles.primaryLabel}>Continue to details</Text>
        </Pressable>

        <Text style={styles.reviewHint}>
          Tap a thumbnail label to retake. Background removal needs iOS 17+ and
          the Vision foreground model — falls back to the original photo if
          unavailable.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.dimRow} />
        <View style={styles.midRow}>
          <View style={styles.dimSide} />
          <View style={styles.frame}>
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
            <Text style={styles.frameLabel}>{step.toUpperCase()}</Text>
          </View>
          <View style={styles.dimSide} />
        </View>
        <View style={styles.dimRowBottom}>
          <Text style={styles.hint}>
            {step === "back" ? HINT.back : HINT.front}
          </Text>
        </View>
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onBack} style={styles.back} disabled={!!processing}>
          <AppIcon name="chevron-back" size={24} color={colors.text} />
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <View style={styles.certPill}>
          <Text style={styles.certPillText}>
            {grader} · {certNumber}
          </Text>
        </View>
        <View
          style={[
            styles.visionPill,
            visionLinked ? styles.visionPillOn : styles.visionPillOff,
          ]}
        >
          <AppIcon
            name={visionLinked ? "sparkles" : "warning-outline"}
            size={12}
            color={visionLinked ? "#27D17F" : "#FFB020"}
          />
          <Text style={styles.visionPillText}>
            BG removal {visionLinked ? "ready" : "unavailable"}
          </Text>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {processing ? (
          <View style={styles.processing}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.processingText}>{processing.label}</Text>
          </View>
        ) : (
          <>
            <View style={styles.progressDots}>
              <Dot active={true} done={front !== null} />
              <Dot active={step === "back"} done={back !== null} />
            </View>
            <Pressable onPress={handleCapture} style={styles.captureOuter}>
              <View style={styles.captureInner} />
            </Pressable>
            <Text style={styles.captureHint}>
              Capture {step === "front" ? "front cover" : "back cover"}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function Dot({ active, done }: { active: boolean; done: boolean }) {
  return (
    <View
      style={[
        styles.dot,
        active && styles.dotActive,
        done && styles.dotDone,
      ]}
    />
  );
}

function CoverPreview({
  label,
  uri,
  removedBg,
  fallbackReason,
  onRetake,
}: {
  label: string;
  uri: string;
  removedBg: boolean;
  fallbackReason?: string;
  onRetake: () => void;
}) {
  return (
    <Pressable onPress={onRetake} style={styles.preview}>
      <Image
        source={{ uri }}
        style={[
          styles.previewImage,
          removedBg ? styles.previewImageRemoved : undefined,
        ]}
        resizeMode="contain"
      />
      <View style={styles.previewFooter}>
        <Text style={styles.previewLabel}>{label}</Text>
        <View
          style={[
            styles.previewBadge,
            removedBg ? styles.previewBadgeOk : styles.previewBadgeWarn,
          ]}
        >
          <AppIcon
            name={removedBg ? "checkmark-circle" : "alert-circle-outline"}
            size={14}
            color={removedBg ? "#27D17F" : "#FFB020"}
          />
          <Text style={styles.previewBadgeText}>
            {removedBg ? "BG removed" : "Original"}
          </Text>
        </View>
      </View>
      {!removedBg && fallbackReason ? (
        <Text style={styles.fallbackReason} numberOfLines={3}>
          {fallbackReason}
        </Text>
      ) : null}
      <Text style={styles.retakeText}>Tap to retake</Text>
    </Pressable>
  );
}

function BgStatusBanner({
  front,
  back,
}: {
  front: PreparedCoverPhoto;
  back: PreparedCoverPhoto;
}) {
  const bothRemoved = front.backgroundRemoved && back.backgroundRemoved;
  const noneRemoved = !front.backgroundRemoved && !back.backgroundRemoved;
  const reason =
    front.fallbackReason ?? back.fallbackReason ?? "vision unavailable";

  if (bothRemoved) {
    return (
      <View style={[styles.banner, styles.bannerOk]}>
        <AppIcon name="checkmark-circle" size={18} color="#27D17F" />
        <Text style={styles.bannerText}>
          Backgrounds removed — ready for eBay
        </Text>
      </View>
    );
  }

  if (noneRemoved) {
    return (
      <View style={[styles.banner, styles.bannerWarn]}>
        <AppIcon name="warning-outline" size={18} color="#FFB020" />
        <Text style={styles.bannerText}>
          Background removal didn't run · {reason}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.banner, styles.bannerWarn]}>
      <AppIcon name="warning-outline" size={18} color="#FFB020" />
      <Text style={styles.bannerText}>
        One cover kept the original background · {reason}
      </Text>
    </View>
  );
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const s = {
    tl: styles.cornerTl,
    tr: styles.cornerTr,
    bl: styles.cornerBl,
    br: styles.cornerBr,
  }[pos];
  return <View style={[styles.corner, s]} />;
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#000", flex: 1 },
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
  overlay: { ...StyleSheet.absoluteFillObject },
  dimRow: { backgroundColor: "rgba(0,0,0,0.55)", flex: 1 },
  midRow: { alignItems: "center", flexDirection: "row", justifyContent: "center" },
  dimSide: { backgroundColor: "rgba(0,0,0,0.55)", flex: 1 },
  frame: {
    borderColor: "rgba(124, 92, 255, 0.4)",
    borderWidth: 1,
    height: 360,
    justifyContent: "center",
    position: "relative",
    width: 250,
  },
  frameLabel: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    position: "absolute",
    right: 8,
    top: 8,
  },
  dimRowBottom: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  hint: { color: colors.text, fontSize: 15, fontWeight: "500", textAlign: "center" },
  corner: { borderColor: colors.accent, height: 36, position: "absolute", width: 36 },
  cornerTl: { borderLeftWidth: 4, borderTopWidth: 4, left: 0, top: 0 },
  cornerTr: { borderRightWidth: 4, borderTopWidth: 4, right: 0, top: 0 },
  cornerBl: { borderBottomWidth: 4, borderLeftWidth: 4, bottom: 0, left: 0 },
  cornerBr: { borderBottomWidth: 4, borderRightWidth: 4, bottom: 0, right: 0 },
  topBar: { gap: 12, paddingHorizontal: 16, zIndex: 2 },
  back: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 4 },
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  backLabel: { color: colors.text, fontSize: 16, fontWeight: "500" },
  certPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  certPillText: { color: colors.text, fontFamily: "Menlo", fontSize: 13, fontWeight: "600" },
  footer: {
    alignItems: "center",
    bottom: 0,
    gap: 12,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 2,
  },
  progressDots: { flexDirection: "row", gap: 8, marginBottom: 4 },
  dot: { backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 5, height: 10, width: 10 },
  dotActive: { backgroundColor: colors.accent },
  dotDone: { backgroundColor: "#27D17F" },
  captureOuter: {
    alignItems: "center",
    borderColor: colors.text,
    borderRadius: 40,
    borderWidth: 4,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  captureInner: { backgroundColor: colors.text, borderRadius: 28, height: 56, width: 56 },
  captureHint: { color: colors.text, fontSize: 14, fontWeight: "500" },
  processing: { alignItems: "center", flexDirection: "row", gap: 10 },
  processingText: { color: colors.text, fontSize: 15 },
  error: { color: colors.danger, fontSize: 14, paddingHorizontal: 16, textAlign: "center" },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  primaryLabel: { color: colors.text, fontSize: 16, fontWeight: "600", textAlign: "center" },
  reviewContainer: {
    backgroundColor: colors.background,
    flex: 1,
    paddingHorizontal: 20,
  },
  reviewTitle: { color: colors.text, fontSize: 26, fontWeight: "700", marginTop: 8 },
  reviewSubtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  previewRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  preview: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    padding: 8,
  },
  previewImage: {
    aspectRatio: 0.66,
    backgroundColor: "#0A0A12",
    borderRadius: 8,
    width: "100%",
  },
  previewImageRemoved: {
    backgroundColor: "#FFFFFF",
  },
  previewFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  previewLabel: { color: colors.text, fontSize: 14, fontWeight: "600" },
  previewBadge: {
    alignItems: "center",
    backgroundColor: colors.inputBackground,
    borderRadius: 6,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  previewBadgeOk: {
    backgroundColor: "rgba(39, 209, 127, 0.16)",
  },
  previewBadgeWarn: {
    backgroundColor: "rgba(255, 176, 32, 0.18)",
  },
  previewBadgeText: { color: colors.text, fontSize: 11, fontWeight: "700" },
  fallbackReason: {
    color: "#FFB020",
    fontFamily: "Menlo",
    fontSize: 10,
    marginTop: 4,
  },
  retakeText: { color: colors.textMuted, fontSize: 11, marginTop: 6, textAlign: "center" },
  reviewHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    textAlign: "center",
  },
  banner: {
    alignItems: "center",
    borderRadius: 10,
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerOk: {
    backgroundColor: "rgba(39, 209, 127, 0.14)",
    borderColor: "rgba(39, 209, 127, 0.35)",
    borderWidth: 1,
  },
  bannerWarn: {
    backgroundColor: "rgba(255, 176, 32, 0.14)",
    borderColor: "rgba(255, 176, 32, 0.35)",
    borderWidth: 1,
  },
  bannerText: { color: colors.text, flex: 1, fontSize: 13, fontWeight: "600" },
  visionPill: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  visionPillOn: {
    backgroundColor: "rgba(39, 209, 127, 0.18)",
  },
  visionPillOff: {
    backgroundColor: "rgba(255, 176, 32, 0.18)",
  },
  visionPillText: { color: colors.text, fontSize: 11, fontWeight: "700" },
});
