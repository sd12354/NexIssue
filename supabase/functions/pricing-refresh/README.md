# pricing-refresh

Pulls **GoCollect sold comps** and **eBay Browse active listings** for a comic (PRD §5.3).

## On-demand

```bash
curl -X POST "$SUPABASE_URL/functions/v1/pricing-refresh" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"comicId":"uuid"}'
```

Response shape:

```json
{
  "comicId": "...",
  "fetchedAt": "2026-05-23T...",
  "sold": { "source": "gocollect", "low30": ..., "count90": ..., "compsStored": 12 },
  "active": { "source": "ebay", "low30": ..., "count90": ..., "compsStored": 8 }
}
```

- **sold** — GoCollect sales with `sale_date`; stored as `source='gocollect'`
- **active** — eBay Browse ask prices; stored as `source='ebay'`, `sale_date=null`

When no comps exist, bands are `null` and counts are `0` (HTTP 200).

## Secrets

```bash
supabase secrets set GOCOLLECT_API_KEY=your-key
# eBay Browse uses OAuth app credentials by default (same env as EBAY_OAUTH_ENV).
# For sandbox OAuth + real active listings, add production Browse keys:
# supabase secrets set EBAY_BROWSE_CLIENT_ID=your-production-app-id
# supabase secrets set EBAY_BROWSE_CLIENT_SECRET=your-production-cert-id
# supabase secrets set EBAY_BROWSE_ENV=production
```

At least one source must be configured.

## Deploy

```bash
supabase functions deploy pricing-refresh --use-api --project-ref kwanmxeicyxohxxuwcjr
```
