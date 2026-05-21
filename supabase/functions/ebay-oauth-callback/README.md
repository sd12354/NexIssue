# ebay-oauth-callback

Handles eBay's OAuth redirect after a user authorizes NexIssue from the
Integrations screen. See [`docs/ebay-oauth-setup.md`](../../../docs/ebay-oauth-setup.md)
for the full developer-dashboard walkthrough.

## What it does

1. Receives a `GET` from eBay with `code` and `state` query params (or
   `error` / `error_description` if the user declined).
2. Validates `state` against `public.oauth_states` (single use, 15 min TTL).
3. Exchanges the code for tokens at
   `https://api.ebay.com/identity/v1/oauth2/token` (sandbox variant when
   `EBAY_OAUTH_ENV=sandbox`).
4. Fetches the connected eBay username from
   `/commerce/identity/v1/user` (non-secret, for display only).
5. Encrypts the access + refresh token payload with AES-256-GCM using the
   `OAUTH_TOKEN_ENCRYPTION_KEY` secret.
6. Upserts the encrypted blob into `public.org_integrations.credentials`,
   and non-secret display metadata into `public.org_integrations.metadata`.
7. 302-redirects the browser to the mobile app via
   `nexissue://oauth/ebay/callback?status=success|error&...`.

## Required Supabase secrets

| Secret | Description |
|---|---|
| `EBAY_CLIENT_ID`              | eBay developer app ID |
| `EBAY_CLIENT_SECRET`          | eBay developer cert ID |
| `EBAY_RUNAME`                 | RuName registered in eBay dev dashboard |
| `EBAY_OAUTH_ENV`              | `production` or `sandbox` (default `production`) |
| `EBAY_OAUTH_RETURN_SCHEME`    | Mobile deep-link scheme (default `nexissue`) |
| `OAUTH_TOKEN_ENCRYPTION_KEY`  | base64 of 32 random bytes (`openssl rand -base64 32`) |

## Deploy

```bash
supabase functions deploy ebay-oauth-callback --no-verify-jwt
```

`--no-verify-jwt` is **required** because eBay cannot present a Supabase
session JWT during the redirect. Security relies on the single-use state
token plus the eBay client secret.

## Test

eBay redirects look like:

```
GET /functions/v1/ebay-oauth-callback?code=v%5E1.1...&state=abc123&expires_in=299
```

You can simulate the unhappy paths locally with `curl`:

```bash
# Unknown state token → 302 to nexissue://oauth/ebay/callback?status=error&error_code=invalid_state
curl -i "https://<project-ref>.functions.supabase.co/ebay-oauth-callback?code=fake&state=does-not-exist"

# User declined on eBay → 302 with ebay_denied
curl -i "https://<project-ref>.functions.supabase.co/ebay-oauth-callback?error=access_denied&error_description=user+declined"
```

For full end-to-end testing, run the mobile app and tap Connect on the eBay
card in Settings → Integrations.
