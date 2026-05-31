import { registerPushToken } from "@app/api";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { useAuth } from "../contexts/AuthContext";
import { useCatalog } from "../contexts/CatalogContext";
import { supabase } from "../lib/supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications() {
  const { user } = useAuth();
  const { orgId } = useCatalog();

  useEffect(() => {
    if (!user?.id || !orgId) return;

    let cancelled = false;

    (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted" || cancelled) return;

      const tokenResult = await Notifications.getExpoPushTokenAsync();
      const expoPushToken = tokenResult.data;
      if (!expoPushToken || cancelled) return;

      await registerPushToken(supabase, {
        userId: user.id,
        orgId,
        expoPushToken,
        platform: Platform.OS,
      });
    })().catch((err) => {
      console.warn("push registration failed", err);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id, orgId]);
}
