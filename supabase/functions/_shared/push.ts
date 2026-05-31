/**
 * Expo Push API — notify org members from edge functions.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function notifyOrgMembers(
  orgId: string,
  message: { title: string; body: string; data?: Record<string, string> },
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("push: Supabase env not configured, skipping notification");
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: tokens, error } = await admin
    .from("push_tokens")
    .select("expo_push_token")
    .eq("org_id", orgId);

  if (error) {
    console.error("push: token lookup failed", error);
    return;
  }

  const pushTokens = (tokens ?? [])
    .map((row) => row.expo_push_token)
    .filter((token): token is string => Boolean(token));

  if (pushTokens.length === 0) return;

  const messages = pushTokens.map((to) => ({
    to,
    sound: "default" as const,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
  }));

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error("push: Expo API error", response.status, detail.slice(0, 300));
      }
    } catch (err) {
      console.error("push: Expo request failed", err);
    }
  }
}
