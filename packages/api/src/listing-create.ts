import { FunctionsHttpError } from "@supabase/supabase-js";

import type { NexIssueSupabaseClient } from "./client";

export type PublishListingInput = {
  comicId: string;
  title: string;
  description: string;
  askingPrice: number;
};

export type PublishListingResult = {
  listingId: string;
  marketplaceListingId: string;
  listingUrl: string | null;
};

export type PublishListingErrorBody = {
  error: string;
  message: string;
};

export class ListingError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ListingError";
  }
}

async function parseFunctionError(error: FunctionsHttpError): Promise<ListingError> {
  const status = error.context?.status;

  try {
    const body = (await error.context.json()) as PublishListingErrorBody;
    if (body.message) {
      return new ListingError(body.error ?? "publish_failed", body.message);
    }
  } catch {
    // Response body was not JSON.
  }

  if (status === 404) {
    return new ListingError(
      "not_deployed",
      "Listing publish is not available on this project. Deploy it with: supabase functions deploy listing-create",
    );
  }

  return new ListingError(
    "publish_failed",
    error.message || `Listing publish failed (HTTP ${status ?? "unknown"}).`,
  );
}

/**
 * Publish a comic listing to eBay via the `listing-create` edge function.
 */
export async function publishListing(
  client: NexIssueSupabaseClient,
  input: PublishListingInput,
): Promise<PublishListingResult> {
  const { data, error } = await client.functions.invoke("listing-create", {
    body: input,
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw await parseFunctionError(error);
    }

    const message = error.message ?? "Listing publish failed";
    if (
      message.includes("Failed to send a request") ||
      message.includes("Network request failed")
    ) {
      throw new ListingError(
        "network_error",
        "Could not reach the server. Check your connection and try again.",
      );
    }

    throw new ListingError("publish_failed", message);
  }

  if (!data || typeof data !== "object") {
    throw new ListingError(
      "publish_failed",
      "Listing publish returned an empty response.",
    );
  }

  const payload = data as Record<string, unknown>;
  if ("error" in payload && typeof payload.message === "string") {
    throw new ListingError(String(payload.error), payload.message);
  }

  const listingId = typeof payload.listingId === "string" ? payload.listingId : null;
  const marketplaceListingId =
    typeof payload.marketplaceListingId === "string"
      ? payload.marketplaceListingId
      : null;
  const listingUrl =
    typeof payload.listingUrl === "string" ? payload.listingUrl : null;

  if (!listingId || !marketplaceListingId) {
    throw new ListingError(
      "publish_failed",
      "Listing publish did not return listing identifiers.",
    );
  }

  return { listingId, marketplaceListingId, listingUrl };
}
