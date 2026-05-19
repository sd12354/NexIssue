import { StyleSheet, View, type ViewStyle } from "react-native";

import { AppIcon } from "./AppIcon";
import { colors } from "../theme/colors";
import type { IconName } from "../theme/icons";

type IconBadgeProps = {
  name: IconName;
  size?: number;
  iconSize?: number;
  color?: string;
  style?: ViewStyle;
};

export function IconBadge({
  name,
  size = 72,
  iconSize = 36,
  color = colors.accent,
  style,
}: IconBadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      <AppIcon name={name} size={iconSize} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    backgroundColor: colors.inputBackground,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    justifyContent: "center",
  },
});
