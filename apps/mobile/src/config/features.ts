/**
 * Feature flags for gradual rollout and fallbacks.
 */
export const FEATURES = {
  /**
   * Call the Supabase `cert-lookup` edge function (CGC/CBCS HTML scrape).
   * Disabled while CGC verify is Cloudflare-blocked; OCR is the primary path.
   */
  CERT_LOOKUP_EDGE_ENABLED: false,
} as const;
