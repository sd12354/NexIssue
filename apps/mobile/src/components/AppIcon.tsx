import { Ionicons } from "@expo/vector-icons";

import { colors } from "../theme/colors";
import type { IconName } from "../theme/icons";

type AppIconProps = {
  name: IconName;
  size?: number;
  color?: string;
};

export function AppIcon({
  name,
  size = 22,
  color = colors.textMuted,
}: AppIconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}
