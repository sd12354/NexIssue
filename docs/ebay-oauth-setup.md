# eBay OAuth setup

This guide walks through everything needed to wire NexIssue's per-org eBay
integration end-to-end. PRD reference: §6 (security), §7.2 (edge functions),
§9 (integrations).

## Architecture

```
 ┌───────────────┐    1. POST                  ┌────────────────────┐
 │ Mobile app    │ ─────────────────────────▶  │ ebay-oauth-start   │
 │ (Integrations │                             │  (verify_jwt=true) │
 │  screen)      │ ◀───────────────────────── │                    │
 │               │   { authorizeUrl, state }   └─────────┬──────────┘
 │ openAuthSess. │                                       │
 │  on URL ────▶ Safari/Custom Tab ──▶ eBay sign-in ──▶ eBay redirect
 │                                                        │
 │                                                        ▼
 │                                          ┌──────────────────────────┐
 │                                          │ ebay-oauth-callback      │
 │                                          │  (verify_jwt=false)      │
 │                                          │  · validate `state`      │
 │ ◀── 302 nexissue://oauth/ebay/callback ─│  · exchange code → tokens│
 │                                          │  · encrypt + upsert      │
 │                                          └──────────────────────────┘
```

Tokens are encrypted in the edge function with **AES-256-GCM** using
`OAUTH_TOKEN_ENCRYPTION_KEY` (a Supabase secret) and stored in
`org_integrations.credentials`. The `credentials` column has column-level
SELECT/INSERT/UPDATE revoked from `authenticated`, so only edge functions
running as `service_role` can read or write the secret blob. Non-secret
display data (eBay username, environment, scopes, expiry timestamps) lives
on `org_integrations.metadata` and is readable by org members via RLS.

State CSRF protection lives in `oauth_states` (15-minute TTL, single use,
service-role only).

## 1. Create your eBay developer app

1. Sign in at <https://developer.ebay.com/> with the eBay account that owns
   the developer program enrollment. The "API access" → "Application Keys"
   page is where everything below happens.
2. Decide whether you're connecting against **Sandbox** or **Production**.
   Build against Sandbox first; only switch to Production once the full
   intake-to-listed loop works.
3. Generate keys for the chosen environment. You'll get:

   | Value | Where it goes |
   |---|---|
   | App ID (Client ID)     | `EBAY_CLIENT_ID` secret |
   | Cert ID (Client Secret)| `EBAY_CLIENT_SECRET` secret |
   | Dev ID                 | Not used today (kept for future Trading API) |

## 2. Register a RuName (redirect URL)

eBay's OAuth uses a **RuName**, not a raw URL, in the `redirect_uri`
parameter. You configure the actual URL on the developer dashboard once and
reference it by RuName everywhere else.

1. In your eBay app's "User Tokens" section, click **Get a Token from eBay
   via Your Application**.
2. Under **Your auth-accepted URL**, paste the production URL of the
   `ebay-oauth-callback` Supabase function:

       https://<project-ref>.functions.supabase.co/ebay-oauth-callback

   Find `<project-ref>` in Supabase Dashboard → Project Settings → API.
3. Under **Your auth-declined URL**, paste the same URL (the function
   handles both success and decline using the `error` query parameter).
4. Copy the RuName eBay generates — looks like
   `Your-Name-AppName-PRD-abc123-xyz789`. This goes into `EBAY_RUNAME`.

Important constraints from eBay:

- Both URLs **must be HTTPS** (Supabase functions already are).
- The URLs cannot be changed without invalidating the RuName.
- You need **separate RuNames** for Sandbox and Production.

## 3. Configure scopes

PRD §9 specifies `sell.inventory` and `sell.fulfillment`. We also request
`commerce.identity.readonly` so we can show the connected eBay username on
the Integrations screen, and `sell.account.readonly` so the listing flow
can read business policies later.

Defaults (defined in `supabase/functions/_shared/ebay.ts`):

| Scope | Reason |
|---|---|
| `https://api.ebay.com/oauth/api_scope`                              | Required base scope |
| `https://api.ebay.com/oauth/api_scope/commerce.identity.readonly`   | Connected user info |
| `https://api.ebay.com/oauth/api_scope/sell.inventory`               | Create/manage listings (PRD) |
| `https://api.ebay.com/oauth/api_scope/sell.fulfillment`             | Fulfillment + sold webhooks (PRD) |
| `https://api.ebay.com/oauth/api_scope/sell.account.readonly`        | Read pre-configured business policies |

If you need to override them, set `EBAY_OAUTH_SCOPES` to a space-separated
list of full scope URLs. eBay's developer dashboard must **enable each
scope** under "User Tokens → OAuth API access for your application" before
they can be requested.

## 4. Set Supabase secrets

From the repo root:

```bash
# Required
supabase secrets set EBAY_CLIENT_ID="your-app-id"
supabase secrets set EBAY_CLIENT_SECRET="your-cert-id"
supabase secrets set EBAY_RUNAME="Your-Name-AppName-PRD-abc123-xyz789"

# Choose one
supabase secrets set EBAY_OAUTH_ENV=production
# supabase secrets set EBAY_OAUTH_ENV=sandbox

# Must match `expo.scheme` in apps/mobile/app.json (default `nexissue`)
supabase secrets set EBAY_OAUTH_RETURN_SCHEME=nexissue

# AES-256-GCM key for encrypting tokens at rest. Generate once and KEEP it
# safe; rotating this key requires re-running the OAuth flow for every org.
supabase secrets set OAUTH_TOKEN_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

Verify they're set:

```bash
supabase secrets list
```

## 5. Apply the migration

The migration `supabase/migrations/20260520160000_ebay_oauth_integrations.sql`
adds the `metadata` column, locks down `credentials` at the column level,
and creates the `oauth_states` table. Apply with:

```bash
supabase db push
```

(or `supabase migration up` for local dev).

## 6. Deploy the edge functions

```bash
supabase functions deploy ebay-oauth-start
supabase functions deploy ebay-oauth-callback --no-verify-jwt
```

`ebay-oauth-callback` MUST be deployed with `--no-verify-jwt` because eBay
cannot present a Supabase session JWT during the redirect. Security relies
on the single-use state token and the eBay client secret.

`supabase/config.toml` already declares the correct `verify_jwt` settings
for local development.

## 7. Test the round-trip

Sandbox flow:

1. Run the mobile app pointing at the Supabase project that holds the
   sandbox RuName (`pnpm --filter mobile dev:clear`).
2. Sign in → Settings → Integrations → tap **Connect** on the eBay card.
3. eBay's sandbox login opens in a system browser. Use a sandbox test buyer
   account (eBay Sandbox → Test User Management).
4. After approving, you should be returned to the app and the eBay card
   should now show **Connected** with the test user's username.

Production flow is identical with a production eBay account.

If the callback function reports an error, the user is still returned to
the app via the deep link with `?status=error&error_code=...&error_message=...`
and the Integrations screen surfaces the message in a red banner. Useful
codes you may see:

| Code | Meaning |
|---|---|
| `missing_params`         | eBay redirect was malformed (rare) |
| `invalid_state`          | State not found — caller didn't go through the app |
| `expired_state`          | User took >15 minutes; ask them to retry |
| `state_already_consumed` | Replay attempt — single-use guard fired |
| `token_exchange_failed`  | eBay rejected the code (check client secret / RuName) |
| `persist_failed`         | Database write failed — inspect function logs |
| `ebay_denied`            | User clicked decline on the eBay consent screen |

## 7.1 Troubleshooting: `unauthorized_client` on eBay login

If the in-app browser shows:

```json
{"error_id":"unauthorized_client","error_description":"The OAuth client was not found."}
```

NexIssue reached eBay successfully — the problem is **eBay doesn't recognize your App ID** in that environment. Check these in order:

### 1. Environment must match your keys

| You use… | Set `EBAY_OAUTH_ENV` to… | Browser should open… |
|---|---|---|
| **Sandbox** App ID / Cert ID | `sandbox` | `auth.sandbox.ebay.com` |
| **Production** App ID / Cert ID | `production` | `auth.ebay.com` or `auth2.ebay.com` |

If you see `auth2.ebay.com` but your keys are from the **Sandbox** column on [developer.ebay.com/my/keys](https://developer.ebay.com/my/keys), set:

```bash
supabase secrets set EBAY_OAUTH_ENV=sandbox --project-ref kwanmxeicyxohxxuwcjr
```

### 2. `EBAY_CLIENT_ID` = App ID, NOT Cert ID

On the Application Keys page, each environment has two values:

- **App ID (Client ID)** → goes in `EBAY_CLIENT_ID` (often contains `-SBX-` or `-PRD-`)
- **Cert ID (Client Secret)** → goes in `EBAY_CLIENT_SECRET`

Swapping these causes `unauthorized_client`.

### 3. `EBAY_RUNAME` = RuName string, NOT the callback URL

Wrong (URL):

```
https://kwanmxeicyxohxxuwcjr.supabase.co/functions/v1/ebay-oauth-callback
```

Right (RuName — copy from eBay dashboard):

```
YourName-NexIssue-SBX-abc123-xyz789
```

In eBay developer dashboard → your app → **User Tokens** → *Get a Token from eBay via Your Application* → register the **HTTPS URL** there, but copy the **RuName** into Supabase.

The RuName must be created under the **same environment** (Sandbox vs Production) as your App ID.

### 4. Use a sandbox test user (sandbox only)

Your real eBay password does not work on sandbox. Create a test user at [developer.ebay.com/sandbox/test-users](https://developer.ebay.com/sandbox/test-users) and sign in with that account.

### 5. Verify secrets in Supabase

Dashboard: [Project → Edge Functions → Secrets](https://supabase.com/dashboard/project/kwanmxeicyxohxxuwcjr/functions/secrets)

Required secrets: `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RUNAME`, `EBAY_OAUTH_ENV`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `EBAY_OAUTH_RETURN_SCHEME`

After updating secrets, retry Connect — no redeploy needed.

## 8. Disconnecting

The Integrations screen offers a **Disconnect** action which deletes the
`org_integrations` row for `provider='ebay'`. eBay tokens are revoked
implicitly the next time you reconnect (a fresh consent grant supersedes
the old refresh token).

To revoke eBay-side as well, the user can go to
<https://www.ebay.com/help/account/protecting-account/permissions-third-party-applications?id=4646>
and remove the NexIssue app.

## 9. Listing comics (Sell Now)

After OAuth is connected, the mobile **Catalog** screen exposes **Sell Now**
for comics with status `in_inventory`. The app:

1. Auto-generates an eBay title, HTML description, and item specifics from
   cert data (PRD §5.4).
2. Lets you edit title, price, and description before publishing.
3. Calls the `listing-create` edge function, which uses the Sell Inventory
   API (inventory item → offer → publish) and saves a row in `listings`.

Deploy the function:

```bash
supabase functions deploy listing-create --project-ref kwanmxeicyxohxxuwcjr --use-api
```

### Sandbox prerequisites

Before your first sandbox listing succeeds, the connected test seller needs:

- **Business policies** — at least one shipping (fulfillment), payment, and
  return policy in [Sandbox Seller Hub](https://www.sandbox.ebay.com/sh/ovw).
  The function auto-fetches the first policy of each type if IDs are not set
  as secrets.
- **Inventory location** — a warehouse/ship-from location in Seller Hub
  (Settings → Business policies → Inventory locations). Optional override:
  `EBAY_MERCHANT_LOCATION_KEY` secret.

Optional Supabase secrets (see `.env.example`):

- `EBAY_CATEGORY_ID` (default `259104` — Collectible Comic Books)
- `EBAY_FULFILLMENT_POLICY_ID`, `EBAY_PAYMENT_POLICY_ID`, `EBAY_RETURN_POLICY_ID`
- `EBAY_MERCHANT_LOCATION_KEY`

If publish fails with a policy or location error, create those in sandbox Seller
Hub first, then retry **Publish to eBay** from the app.

## Future work

- Add a Shippo connect flow (API key, not OAuth — paste-in form).
- Add a GoCollect connect flow once the pricing pipeline lands.
- Background refresh of access tokens using the encrypted refresh token —
  a new `ebay-token-refresh` edge function that decrypts, calls the eBay
  token endpoint with `grant_type=refresh_token`, and re-encrypts.
- Server-side scoping based on role (PRD §5.1) — `helper` users should not
  see disconnect actions. The current screen lets any org member disconnect
  because RLS still allows DELETE for all members. Tighten when roles are
  enforced.
