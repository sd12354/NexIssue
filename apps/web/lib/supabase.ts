import { createClient, type NexIssueSupabaseClient } from "@app/api";

let client: NexIssueSupabaseClient | null = null;

export function getSupabase(): NexIssueSupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  client = createClient({ url, anonKey });
  return client;
}
