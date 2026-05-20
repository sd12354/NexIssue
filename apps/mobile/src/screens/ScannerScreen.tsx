import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "../components/AppIcon";
import { parseCertUrl, type Grader, type ParsedCert } from "../lib/cert";
import { colors } from "../theme/colors";

type ScannerState = "PERMISSION_REQUESTED" | "SCANNING" | "DETECTED";

type ScannerScreenProps = {
  onContinueToLabel: (params: { grader: Grader; certNumber: string }) => void;
};

const BRACKET_SIZE = 48;
const BRACKET_THICKNESS = 4;
const TARGET_SIZE = 260;

function CornerBracket({
  position,
}: {
  position: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
}) {
  const cornerStyle = {
    topLeft: styles.bracketTopLeft,
    topRight: styles.bracketTopRight,
    bottomLeft: styles.bracketBottomLeft,
    bottomRight: styles.bracketBottomRight,
  }[position];

  return <View style={[styles.bracket, cornerStyle]} />;
}

function QrTargetOverlay() {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.dimmed} />
      <View style={styles.targetRow}>
        <View style={styles.dimmedSide} />
        <View style={styles.target}>
          <CornerBracket position="topLeft" />
          <CornerBracket position="topRight" />
          <CornerBracket position="bottomLeft" />
          <CornerBracket position="bottomRight" />
        </View>
        <View style={styles.dimmedSide} />
      </View>
      <View style={styles.dimmedBottom}>
        <Text style={styles.hint}>Point at the slab QR code</Text>
      </View>
    </View>
  );
}

function ManualEntryModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (params: { grader: Grader; certNumber: string }) => void;
}) {
  const [certNumber, setCertNumber] = useState("");
  const [grader, setGrader] = useState<Grader>("CGC");
  const [keyboardInset, setKeyboardInset] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      return;
    }

    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardInset(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardInset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const handleConfirm = () => {
    const trimmed = certNumber.trim();
    if (!trimmed) return;
    onConfirm({ grader, certNumber: trimmed });
    setCertNumber("");
    setGrader("CGC");
    onClose();
  };

  const handleClose = () => {
    Keyboard.dismiss();
    setCertNumber("");
    setGrader("CGC");
    onClose();
  };

  const sheetPaddingBottom = Math.max(insets.bottom, 16) + keyboardInset;

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalRoot}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleClose} />
        <View
          style={[styles.modalSheet, { paddingBottom: sheetPaddingBottom }]}
        >
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalScrollContent}
          >
            <Text style={styles.modalTitle}>Enter cert number</Text>
            <Text style={styles.modalSubtitle}>
              Choose grader and type the number from the slab label.
            </Text>

            <View style={styles.graderRow}>
              {(["CGC", "CBCS"] as const).map((option) => {
                const selected = grader === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setGrader(option)}
                    style={[
                      styles.graderChip,
                      selected && styles.graderChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.graderChipLabel,
                        selected && styles.graderChipLabelSelected,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus={visible}
              keyboardType="default"
              placeholder="Cert number"
              placeholderTextColor={colors.textMuted}
              returnKeyType="done"
              style={styles.modalInput}
              value={certNumber}
              onChangeText={setCertNumber}
              onSubmitEditing={handleConfirm}
            />

            <Pressable
              onPress={handleConfirm}
              style={({ pressed }) => [
                styles.modalConfirm,
                pressed && styles.modalConfirmPressed,
                !certNumber.trim() && styles.modalConfirmDisabled,
              ]}
              disabled={!certNumber.trim()}
            >
              <Text style={styles.modalConfirmLabel}>Confirm</Text>
            </Pressable>

            <Pressable onPress={handleClose} style={styles.modalCancel}>
              <Text style={styles.modalCancelLabel}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ScannerScreen({ onContinueToLabel }: ScannerScreenProps) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerState, setScannerState] = useState<ScannerState>(
    "PERMISSION_REQUESTED",
  );
  const [detected, setDetected] = useState<ParsedCert | null>(null);
  const [manualVisible, setManualVisible] = useState(false);
  const scanLock = useRef(false);

  useEffect(() => {
    if (permission?.granted && scannerState === "PERMISSION_REQUESTED") {
      setScannerState("SCANNING");
    }
  }, [permission?.granted, scannerState]);

  const resetScan = useCallback(() => {
    scanLock.current = false;
    setDetected(null);
    setScannerState("SCANNING");
  }, []);

  const handleBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scannerState !== "SCANNING" || scanLock.current) return;

      const parsed = parseCertUrl(data);
      if (!parsed) return;

      scanLock.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDetected(parsed);
      setScannerState("DETECTED");
    },
    [scannerState],
  );

  const handleContinue = () => {
    if (!detected) return;
    onContinueToLabel(detected);
  };

  const handleManualConfirm = (params: { grader: Grader; certNumber: string }) => {
    setManualVisible(false);
    onContinueToLabel(params);
  };

  if (!permission) {
    return <View style={styles.fallback} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permission, { paddingTop: insets.top + 24 }]}>
        <AppIcon name="camera-outline" size={48} color={colors.accent} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          NexIssue uses your camera to read CGC and CBCS slab QR codes for cert
          lookup.
        </Text>
        <Pressable
          onPress={requestPermission}
          style={({ pressed }) => [
            styles.permissionButton,
            pressed && styles.permissionButtonPressed,
          ]}
        >
          <Text style={styles.permissionButtonLabel}>Allow camera</Text>
        </Pressable>
        <Pressable onPress={() => setManualVisible(true)}>
          <Text style={styles.manualLink}>Type cert number manually</Text>
        </Pressable>
        <ManualEntryModal
          visible={manualVisible}
          onClose={() => setManualVisible(false)}
          onConfirm={handleManualConfirm}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={
          scannerState === "SCANNING" ? handleBarcodeScanned : undefined
        }
      />

      {scannerState === "SCANNING" ? <QrTargetOverlay /> : null}

      {scannerState === "DETECTED" && detected ? (
        <View style={styles.detectedOverlay}>
          <View style={styles.detectedScrim} />
          <View
            style={[styles.detectedSheet, { paddingBottom: insets.bottom + 24 }]}
          >
            <View style={styles.detectedCard}>
              <Text style={styles.detectedLabel}>{detected.grader}</Text>
              <Text style={styles.detectedCert}>{detected.certNumber}</Text>
            </View>
            <Pressable
              onPress={handleContinue}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonLabel}>Capture label</Text>
            </Pressable>
            <Pressable onPress={resetScan} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonLabel}>Scan again</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {scannerState === "SCANNING" ? (
        <View style={[styles.scanFooter, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable onPress={() => setManualVisible(true)}>
            <Text style={styles.manualLink}>Type cert number manually</Text>
          </Pressable>
        </View>
      ) : null}

      <ManualEntryModal
        visible={manualVisible}
        onClose={() => setManualVisible(false)}
        onConfirm={handleManualConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000",
    flex: 1,
  },
  fallback: {
    backgroundColor: colors.background,
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
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  permissionBody: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  permissionButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  permissionButtonPressed: {
    backgroundColor: colors.accentPressed,
  },
  permissionButtonLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  dimmed: {
    backgroundColor: "rgba(0,0,0,0.55)",
    flex: 1,
  },
  targetRow: {
    flexDirection: "row",
    height: TARGET_SIZE,
  },
  dimmedSide: {
    backgroundColor: "rgba(0,0,0,0.55)",
    flex: 1,
  },
  target: {
    height: TARGET_SIZE,
    position: "relative",
    width: TARGET_SIZE,
  },
  dimmedBottom: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 24,
  },
  hint: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
  },
  bracket: {
    borderColor: colors.accent,
    height: BRACKET_SIZE,
    position: "absolute",
    width: BRACKET_SIZE,
  },
  bracketTopLeft: {
    borderLeftWidth: BRACKET_THICKNESS,
    borderTopWidth: BRACKET_THICKNESS,
    left: 0,
    top: 0,
  },
  bracketTopRight: {
    borderRightWidth: BRACKET_THICKNESS,
    borderTopWidth: BRACKET_THICKNESS,
    right: 0,
    top: 0,
  },
  bracketBottomLeft: {
    borderBottomWidth: BRACKET_THICKNESS,
    borderLeftWidth: BRACKET_THICKNESS,
    bottom: 0,
    left: 0,
  },
  bracketBottomRight: {
    borderBottomWidth: BRACKET_THICKNESS,
    borderRightWidth: BRACKET_THICKNESS,
    bottom: 0,
    right: 0,
  },
  scanFooter: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
  manualLink: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  detectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  detectedScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  detectedSheet: {
    gap: 12,
    paddingHorizontal: 20,
    zIndex: 1,
  },
  detectedCard: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 20,
  },
  detectedLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  detectedCert: {
    color: colors.text,
    fontFamily: "Menlo",
    fontSize: 28,
    fontWeight: "700",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
  },
  primaryButtonPressed: {
    backgroundColor: colors.accentPressed,
  },
  primaryButtonLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryButtonLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  modalScrollContent: {
    gap: 12,
    paddingBottom: 8,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  modalSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  graderRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  graderChip: {
    borderColor: colors.surfaceBorder,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  graderChipSelected: {
    backgroundColor: colors.inputBackground,
    borderColor: colors.accent,
  },
  graderChipLabel: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  graderChipLabelSelected: {
    color: colors.accent,
  },
  modalInput: {
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalConfirm: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    marginTop: 4,
    paddingVertical: 16,
  },
  modalConfirmPressed: {
    backgroundColor: colors.accentPressed,
  },
  modalConfirmDisabled: {
    opacity: 0.5,
  },
  modalConfirmLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  modalCancel: {
    alignItems: "center",
    paddingVertical: 8,
  },
  modalCancelLabel: {
    color: colors.textMuted,
    fontSize: 15,
  },
});
