/**
 * eBay OAuth helpers (PRD §9).
 *
 * Supports both production and sandbox environments. Toggle via the
 * `EBAY_OAUTH_ENV` secret (`production` | `sandbox`, default `production`).
 *
 * Scopes per PRD: sell.inventory + sell.fulfillment + commerce.identity for
 * fetching the connected user's eBay username on completion.
 */

export type EbayEnv = "production" | "sandbox";

export type EbayOAuthConfig = {
  clientId: string;
  ruName: string;
  env: EbayEnv;
};

export type EbayOAuthConfigIssue = {
  code: string;
  message: string;
};

/** Trim secrets and normalize env so copy/paste mistakes don't break OAuth. */
export function parseEbayOAuthConfig(raw: {
  clientId?: string | null;
  ruName?: string | null;
  env?: string | null;
}): EbayOAuthConfig {
  const clientId = raw.clientId?.trim() ?? "";
  const ruName = raw.ruName?.trim() ?? "";
  const envRaw = (raw.env?.trim().toLowerCase() ?? "production");
  const env: EbayEnv = envRaw === "sandbox" || envRaw === "sbx" ? "sandbox" : "production";
  return { clientId, ruName, env };
}

/** Catch the most common eBay dashboard misconfiguration before hitting eBay. */
export function validateEbayOAuthConfig(
  config: EbayOAuthConfig,
): EbayOAuthConfigIssue | null {
  if (!config.clientId) {
    return {
      code: "missing_client_id",
      message: "EBAY_CLIENT_ID is empty. Set it to your eBay App ID (Client ID).",
    };
  }
  if (!config.ruName) {
    return {
      code: "missing_runame",
      message: "EBAY_RUNAME is empty. Set it to the RuName string from eBay developer dashboard.",
    };
  }
  if (/^https?:\/\//i.test(config.ruName) || config.ruName.includes("supabase.co")) {
    return {
      code: "runame_is_url",
      message:
        "EBAY_RUNAME must be the RuName string (e.g. YourName-AppName-SBX-abc123), NOT the callback URL. In eBay developer dashboard → User Tokens → copy the RuName value.",
    };
  }
  // Cert IDs are typically longer hex-ish strings; App IDs contain hyphens and PRD/SBX.
  if (/^[a-f0-9]{32,}$/i.test(config.clientId)) {
    return {
      code: "client_id_looks_like_cert",
      message:
        "EBAY_CLIENT_ID looks like a Cert ID (Client Secret). Use the App ID (Client ID) from Application Keys instead.",
    };
  }
  if (config.env === "sandbox" && config.clientId.includes("-PRD-")) {
    return {
      code: "env_client_mismatch",
      message:
        "EBAY_OAUTH_ENV is sandbox but EBAY_CLIENT_ID looks like a Production App ID (-PRD-). Use keys from the Sandbox column on developer.ebay.com.",
    };
  }
  if (config.env === "production" && config.clientId.includes("-SBX-")) {
    return {
      code: "env_client_mismatch",
      message:
        "EBAY_OAUTH_ENV is production but EBAY_CLIENT_ID looks like a Sandbox App ID (-SBX-). Set EBAY_OAUTH_ENV=sandbox or switch to Production keys.",
    };
  }
  return null;
}

export function ebayOAuthConfigHints(config: EbayOAuthConfig) {
  return {
    environment: config.env,
    authHost: new URL(ebayUrls(config.env).authorize).host,
    clientIdSuffix: config.clientId.slice(-6),
    ruNamePrefix: config.ruName.slice(0, 24),
  };
}

export type EbayUrls = {
  authorize: string;
  token: string;
  identity: string;
};

export const EBAY_DEFAULT_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.account",
];

export function ebayUrls(env: EbayEnv): EbayUrls {
  if (env === "sandbox") {
    return {
      authorize: "https://auth.sandbox.ebay.com/oauth2/authorize",
      token: "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
      identity: "https://apiz.sandbox.ebay.com/commerce/identity/v1/user/",
    };
  }
  return {
    authorize: "https://auth.ebay.com/oauth2/authorize",
    token: "https://api.ebay.com/identity/v1/oauth2/token",
    identity: "https://apiz.ebay.com/commerce/identity/v1/user/",
  };
}

export function buildAuthorizeUrl(opts: {
  env: EbayEnv;
  clientId: string;
  ruName: string;
  scopes: string[];
  state: string;
  prompt?: "login" | "consent";
}): string {
  const url = new URL(ebayUrls(opts.env).authorize);
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", opts.ruName);
  url.searchParams.set("scope", opts.scopes.join(" "));
  url.searchParams.set("state", opts.state);
  if (opts.prompt) url.searchParams.set("prompt", opts.prompt);
  return url.toString();
}

export type EbayTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  token_type: string;
};

export async function exchangeCodeForTokens(opts: {
  env: EbayEnv;
  clientId: string;
  clientSecret: string;
  ruName: string;
  code: string;
}): Promise<EbayTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.ruName,
  });
  const basic = btoa(`${opts.clientId}:${opts.clientSecret}`);
  const response = await fetch(ebayUrls(opts.env).token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `eBay token exchange failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }
  return (await response.json()) as EbayTokenResponse;
}

export type EbayUserInfo = {
  username: string | null;
  accountType: string | null;
  registrationMarketplaceId: string | null;
};

export async function fetchEbayUser(opts: {
  env: EbayEnv;
  accessToken: string;
}): Promise<EbayUserInfo> {
  const response = await fetch(ebayUrls(opts.env).identity, {
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    return {
      username: null,
      accountType: null,
      registrationMarketplaceId: null,
    };
  }
  const json = await response.json() as Record<string, unknown>;
  return {
    username: typeof json.username === "string" ? json.username : null,
    accountType: typeof json.accountType === "string" ? json.accountType : null,
    registrationMarketplaceId:
      typeof json.registrationMarketplaceId === "string"
        ? json.registrationMarketplaceId
        : null,
  };
}
