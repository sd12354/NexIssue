import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors } from "../theme/colors";

const COMIC_QUIPS = [
  "Bagging and boarding…",
  "Polishing your slabs…",
  "Sorting the long boxes…",
  "Calling Stan’s ghost for grading tips…",
  "Negotiating with the cover artist…",
  "Reading the variant cover small print…",
  "Pressing pages flat…",
  "Whispering “make mine NexIssue”…",
  "Hunting that 9.8…",
  "Decoding cert numbers in the multiverse…",
];

type LoadingSplashProps = {
  /** Optional override; defaults to a random cheeky line each mount */
  message?: string;
};

export function LoadingSplash({ message }: LoadingSplashProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const quipFade = useRef(new Animated.Value(1)).current;

  const [quipIndex, setQuipIndex] = useState(() =>
    Math.floor(Math.random() * COMIC_QUIPS.length),
  );

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 4800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [fade, pulse, spin]);

  useEffect(() => {
    if (message) return;
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(quipFade, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(quipFade, {
          toValue: 1,
          duration: 320,
          useNativeDriver: true,
        }),
      ]).start();

      setTimeout(() => {
        setQuipIndex((index) => (index + 1) % COMIC_QUIPS.length);
      }, 240);
    }, 2200);
    return () => clearInterval(interval);
  }, [message, quipFade]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.08],
  });
  const haloOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.42],
  });
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.95, 1.25],
  });
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const quip = useMemo(
    () => message ?? COMIC_QUIPS[quipIndex] ?? COMIC_QUIPS[0]!,
    [message, quipIndex],
  );

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.stack, { opacity: fade }]}>
        <View style={styles.logoWrap}>
          <Animated.View
            style={[
              styles.halo,
              { opacity: haloOpacity, transform: [{ scale: haloScale }] },
            ]}
          />
          <Animated.View
            style={[
              styles.ringWrap,
              { transform: [{ rotate }] },
            ]}
          >
            <View style={styles.ring} />
            <View style={[styles.ringDot, styles.ringDotTop]} />
            <View style={[styles.ringDot, styles.ringDotRight]} />
            <View style={[styles.ringDot, styles.ringDotBottom]} />
            <View style={[styles.ringDot, styles.ringDotLeft]} />
          </Animated.View>
          <Animated.Image
            accessibilityLabel="NexIssue"
            source={require("../../assets/logo.png")}
            style={[styles.logo, { transform: [{ scale }] }]}
          />
        </View>

        <View style={styles.copy}>
          <Text style={styles.brand}>NexIssue</Text>
          <Animated.Text style={[styles.quip, { opacity: quipFade }]}>
            {quip}
          </Animated.Text>
        </View>
      </Animated.View>
    </View>
  );
}

const LOGO_SIZE = 112;
const RING_SIZE = LOGO_SIZE + 56;
const HALO_SIZE = LOGO_SIZE + 120;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  stack: {
    alignItems: "center",
    gap: 28,
  },
  logoWrap: {
    alignItems: "center",
    height: HALO_SIZE,
    justifyContent: "center",
    width: HALO_SIZE,
  },
  halo: {
    backgroundColor: colors.accent,
    borderRadius: HALO_SIZE / 2,
    height: HALO_SIZE,
    position: "absolute",
    width: HALO_SIZE,
  },
  ringWrap: {
    alignItems: "center",
    height: RING_SIZE,
    justifyContent: "center",
    position: "absolute",
    width: RING_SIZE,
  },
  ring: {
    borderColor: "rgba(124, 92, 255, 0.35)",
    borderRadius: RING_SIZE / 2,
    borderStyle: "dashed",
    borderWidth: 1.5,
    height: RING_SIZE,
    position: "absolute",
    width: RING_SIZE,
  },
  ringDot: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    height: 8,
    position: "absolute",
    width: 8,
  },
  ringDotTop: { top: -4 },
  ringDotRight: { right: -4 },
  ringDotBottom: { bottom: -4 },
  ringDotLeft: { left: -4 },
  logo: {
    height: LOGO_SIZE,
    resizeMode: "contain",
    width: LOGO_SIZE,
  },
  copy: {
    alignItems: "center",
    gap: 10,
  },
  brand: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  quip: {
    color: colors.textMuted,
    fontSize: 15,
    fontStyle: "italic",
    letterSpacing: 0.2,
    textAlign: "center",
  },
});
