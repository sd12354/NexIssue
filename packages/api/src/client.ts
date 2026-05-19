import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from "@supabase/supabase-js";
import type { Database } from "types";

export type NexIssueSupabaseClient = SupabaseClient<Database>;

export type CreateSupabaseClientOptions = {
  url: string;
  anonKey: string;
  auth?: SupabaseClientOptions<Database>["auth"];
};

export function createSupabaseClient(
  options: CreateSupabaseClientOptions,
): NexIssueSupabaseClient {
  return createClient<Database>(options.url, options.anonKey, {
    auth: options.auth,
  });
}
