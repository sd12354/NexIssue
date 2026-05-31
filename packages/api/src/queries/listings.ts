import type { Tables } from "types";

import type { NexIssueSupabaseClient } from "../client";

export type Listing = Tables<"listings">;

export type ListingWithComic = Listing & {
  comic: Pick<
    Tables<"comics">,
    "id" | "title" | "issue" | "cert_number" | "grader" | "grade"
  > | null;
};

export async function listListings(
  client: NexIssueSupabaseClient,
  orgId: string,
): Promise<ListingWithComic[]> {
  const { data, error } = await client
    .from("listings")
    .select(
      `
      *,
      comic:comics (
        id,
        title,
        issue,
        cert_number,
        grader,
        grade
      )
    `,
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => {
    const comicRaw = row.comic as
      | ListingWithComic["comic"]
      | ListingWithComic["comic"][]
      | null;
    const comic = Array.isArray(comicRaw) ? comicRaw[0] ?? null : comicRaw;
    return { ...(row as Listing), comic };
  });
}
