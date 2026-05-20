import { FunctionsHttpError } from "@supabase/supabase-js";

import type { NexIssueSupabaseClient } from "./client";

export type Grader = "CGC" | "CBCS";

export type CertLookupResult = {
  grader: Grader;
  certNumber: string;
  title: string | null;
  issue: string | null;
  variant: string | null;
  year: number | null;
  grade: string | null;
  encapsulationDate: string | null;
  keyNotes: string[];
};

export type CertLookupErrorBody = {
  error: string;
  message: string;
};

export class CertLookupError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "CertLookupError";
  }
}

async function parseFunctionError(
  error: FunctionsHttpError,
): Promise<CertLookupError> {
  const status = error.context?.status;

  try {
    const body = (await error.context.json()) as CertLookupErrorBody;
    if (body.message) {
      return new CertLookupError(
        body.error ?? "lookup_failed",
        body.message,
      );
    }
  } catch {
    // Response body was not JSON.
  }

  if (status === 404) {
    return new CertLookupError(
      "not_deployed",
      "Cert lookup is not available on this project. Deploy it with: supabase functions deploy cert-lookup --use-api",
    );
  }

  return new CertLookupError(
    "lookup_failed",
    error.message || `Cert lookup failed (HTTP ${status ?? "unknown"}).`,
  );
}

export async function lookupCert(
  client: NexIssueSupabaseClient,
  params: { grader: Grader; certNumber: string },
): Promise<CertLookupResult> {
  const { data, error } = await client.functions.invoke("cert-lookup", {
    body: params,
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      throw await parseFunctionError(error);
    }

    const message = error.message ?? "Cert lookup failed";
    if (
      message.includes("Failed to send a request") ||
      message.includes("Network request failed")
    ) {
      throw new CertLookupError(
        "network_error",
        "Could not reach the server. Check your connection and try again.",
      );
    }

    throw new CertLookupError("lookup_failed", message);
  }

  if (!data || typeof data !== "object") {
    throw new CertLookupError(
      "lookup_failed",
      "Cert lookup returned an empty response.",
    );
  }

  const payload = data as Record<string, unknown>;
  if ("error" in payload && typeof payload.message === "string") {
    throw new CertLookupError(String(payload.error), payload.message);
  }

  return data as CertLookupResult;
}
