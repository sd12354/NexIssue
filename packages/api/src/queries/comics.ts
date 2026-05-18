import type { Tables, TablesInsert, TablesUpdate } from "types";
import type { NexIssueSupabaseClient } from "../client";

export type Comic = Tables<"comics">;
export type ComicInsert = TablesInsert<"comics">;
export type ComicUpdate = TablesUpdate<"comics">;

export type ListComicsOptions = {
  orgId: string;
  status?: Comic["status"];
};

export async function listComics(
  client: NexIssueSupabaseClient,
  options: ListComicsOptions,
): Promise<Comic[]> {
  let query = client
    .from("comics")
    .select("*")
    .eq("org_id", options.orgId)
    .order("created_at", { ascending: false });

  if (options.status !== undefined) {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getComic(
  client: NexIssueSupabaseClient,
  orgId: string,
  comicId: string,
): Promise<Comic | null> {
  const { data, error } = await client
    .from("comics")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", comicId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createComic(
  client: NexIssueSupabaseClient,
  comic: ComicInsert,
): Promise<Comic> {
  const { data, error } = await client
    .from("comics")
    .insert(comic)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateComic(
  client: NexIssueSupabaseClient,
  orgId: string,
  comicId: string,
  updates: ComicUpdate,
): Promise<Comic> {
  const { data, error } = await client
    .from("comics")
    .update(updates)
    .eq("org_id", orgId)
    .eq("id", comicId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteComic(
  client: NexIssueSupabaseClient,
  orgId: string,
  comicId: string,
): Promise<void> {
  const { error } = await client
    .from("comics")
    .delete()
    .eq("org_id", orgId)
    .eq("id", comicId);

  if (error) throw error;
}
