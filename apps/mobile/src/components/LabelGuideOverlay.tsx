import { StyleSheet, Text, View } from "react-native";

import { colors } from "../theme/colors";

const BRACKET = 4;
const CORNER = 40;

type LabelGuideOverlayProps = {
  hint: string;
  /** Landscape frame matching CGC slab label aspect ratio (~2.5:1) */
  frameWidth?: number;
  frameHeight?: number;
};

function Corner({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const cornerStyle = {
    tl: styles.tl,
    tr: styles.tr,
    bl: styles.bl,
    br: styles.br,
  }[position];
  return <View style={[styles.corner, cornerStyle]} />;
}

export function LabelGuideOverlay({
  hint,
  frameWidth = 340,
  frameHeight = 150,
}: LabelGuideOverlayProps) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.dimmed} />
      <View style={styles.middleRow}>
        <View style={styles.dimmedSide} />
        <View style={[styles.frame, { width: frameWidth, height: frameHeight }]}>
          <Corner position="tl" />
          <Corner position="tr" />
          <Corner position="bl" />
          <Corner position="br" />
          <Text style={styles.frameLabel}>Label</Text>
        </View>
        <View style={styles.dimmedSide} />
      </View>
      <View style={styles.dimmedBottom}>
        <Text style={styles.hint}>{hint}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  dimmed: {
    backgroundColor: "rgba(0,0,0,0.55)",
    flex: 1,
  },
  middleRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  dimmedSide: {
    backgroundColor: "rgba(0,0,0,0.55)",
    flex: 1,
  },
  frame: {
    borderColor: "rgba(124, 92, 255, 0.35)",
    borderWidth: 1,
    justifyContent: "center",
    position: "relative",
  },
  frameLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    position: "absolute",
    right: 8,
    textTransform: "uppercase",
    top: 8,
  },
  dimmedBottom: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  hint: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  corner: {
    borderColor: colors.accent,
    height: CORNER,
    position: "absolute",
    width: CORNER,
  },
  tl: {
    borderLeftWidth: BRACKET,
    borderTopWidth: BRACKET,
    left: 0,
    top: 0,
  },
  tr: {
    borderRightWidth: BRACKET,
    borderTopWidth: BRACKET,
    right: 0,
    top: 0,
  },
  bl: {
    borderBottomWidth: BRACKET,
    borderLeftWidth: BRACKET,
    bottom: 0,
    left: 0,
  },
  br: {
    borderBottomWidth: BRACKET,
    borderRightWidth: BRACKET,
    bottom: 0,
    right: 0,
  },
});
