# cert-lookup

Supabase Edge Function for CGC/CBCS certification enrichment (PRD §7.2).

## Deploy

```bash
supabase functions deploy cert-lookup --use-api
```

Use `--use-api` to bundle in Supabase’s cloud (faster than local Docker).

Apply the rate-limit migration first if not already on the project:

```bash
supabase db push
```

## Request

`POST /functions/v1/cert-lookup`

Headers:

- `Authorization: Bearer <user_access_token>`
- `apikey: <SUPABASE_ANON_KEY>`
- `Content-Type: application/json`

Body:

```json
{
  "grader": "CGC",
  "certNumber": "3965281001"
}
```

## Response (200)

```json
{
  "grader": "CGC",
  "certNumber": "3965281001",
  "title": "Amazing Spider-Man",
  "issue": "300",
  "variant": null,
  "year": 1988,
  "grade": "9.8",
  "encapsulationDate": "2020-05-12",
  "keyNotes": ["White pages"]
}
```

## Errors

| Status | `error`            | When                                      |
|--------|--------------------|-------------------------------------------|
| 401    | `unauthorized`     | Missing/invalid JWT                       |
| 400    | `bad_request`      | Invalid grader or cert number             |
| 404    | `not_found`        | Cert not found or HTML could not be parsed |
| 429    | `rate_limited`     | More than 30 requests/min per user        |
| 503    | `scrape_blocked`   | CGC Cloudflare challenge                  |
| 503    | `scrape_unavailable` | CBCS SPA shell (no data in HTML)        |

## curl example

Replace placeholders with your project ref and a signed-in user's access token:

```bash
curl -sS -X POST \
  "https://kwanmxeicyxohxxuwcjr.supabase.co/functions/v1/cert-lookup" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"grader":"CGC","certNumber":"3965281001"}' | jq
```

Local (with `supabase functions serve cert-lookup`):

```bash
curl -sS -X POST \
  "http://127.0.0.1:54321/functions/v1/cert-lookup" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"grader":"CGC","certNumber":"3965281001"}' | jq
```

## Updating HTML selectors

CGC and CBCS change their verify UIs without notice. When lookups start failing with `not_found` or empty fields:

1. Open the verify URL in a browser and inspect the rendered DOM.
2. Edit parsers in `index.ts`:
   - `LABEL_MAP` — label text → response field
   - `extractTitleFallback` — CSS selectors for title
   - `extractFromTables` / `extractFromDefinitionLists` — row structure
   - `isNotFoundHtml` / `isCloudflareChallenge` — failure detection strings
3. Redeploy: `supabase functions deploy cert-lookup`

**CGC:** `https://www.cgccomics.com/certlookup/<certNumber>/`

**CBCS:** `https://www.cbcscomics.com/certlookup/<certNumber>/` (often an Angular shell; scraping may return `scrape_unavailable` until an API partnership or SSR path exists).
