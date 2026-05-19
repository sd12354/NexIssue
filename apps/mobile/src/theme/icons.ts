import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

import type { MainTab } from "../navigation/types";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export const tabIcons: Record<
  MainTab,
  { active: IconName; inactive: IconName }
> = {
  Home: { active: "home", inactive: "home-outline" },
  Catalog: { active: "albums", inactive: "albums-outline" },
  Scan: { active: "qr-code", inactive: "qr-code-outline" },
  Advisor: { active: "sparkles", inactive: "sparkles-outline" },
  Settings: { active: "settings", inactive: "settings-outline" },
};

export const headerIcons: Record<MainTab, IconName> = {
  Home: "layers",
  Catalog: "albums-outline",
  Scan: "qr-code-outline",
  Advisor: "sparkles-outline",
  Settings: "settings-outline",
};

export const screenHeroIcons: Record<MainTab, IconName> = {
  Home: "home-outline",
  Catalog: "albums-outline",
  Scan: "qr-code-outline",
  Advisor: "sparkles-outline",
  Settings: "settings-outline",
};

export const authIcons = {
  email: "mail-outline" as IconName,
  password: "lock-closed-outline" as IconName,
  signIn: "log-in-outline" as IconName,
  signUp: "person-add-outline" as IconName,
  signOut: "log-out-outline" as IconName,
  user: "person-circle-outline" as IconName,
  mailSent: "mail-unread-outline" as IconName,
  error: "alert-circle-outline" as IconName,
};
