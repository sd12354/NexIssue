import { ActivityIndicator, StyleSheet, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../theme/colors";

type ScreenProps = ViewProps & {
  loading?: boolean;
};

export function Screen({ children, loading, style, ...props }: ScreenProps) {
  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.centered]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.inner, style]} {...props}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
});
