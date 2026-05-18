import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "types";

export type NexIssueSupabaseClient = SupabaseClient<Database>;

export type CreateSupabaseClientOptions = {
  url: string;
  anonKey: string;
};

export function createSupabaseClient(
  options: CreateSupabaseClientOptions,
): NexIssueSupabaseClient {
  return createClient<Database>(options.url, options.anonKey);
}
