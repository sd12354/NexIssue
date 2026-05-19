import { StyleSheet, Text, View } from "react-native";

import { IconBadge } from "../components/IconBadge";
import { Screen } from "../components/Screen";
import { colors } from "../theme/colors";
import type { IconName } from "../theme/icons";

type PlaceholderScreenProps = {
  title: string;
  description: string;
  icon: IconName;
};

export function PlaceholderScreen({
  title,
  description,
  icon,
}: PlaceholderScreenProps) {
  return (
    <Screen>
      <View style={styles.container}>
        <IconBadge name={icon} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    gap: 16,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
});
