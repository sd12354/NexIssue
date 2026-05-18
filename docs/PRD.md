# Graded Comic Operations Platform — PRD

**Status:** Draft v0.4
**Owner:** [You]
**Last updated:** May 17, 2026

---

## 1. Overview

### 1.1 Vision

A mobile-first operations platform — paired with a full-featured desktop web companion — that takes a graded comic from physical receipt to listed-and-sold in minutes. The mobile app handles physical-world tasks (scanning slabs, photographing books, point-of-sale workflows) while the web app handles desk-bound work (bulk catalog management, detailed pricing analysis, listing review, advisor sessions, account administration). Both share the same backend and data; users move fluidly between them.

### 1.2 Problem statement

Reselling graded comics involves repetitive, disconnected work: manually entering slab details, researching comps across GoCollect and eBay, deciding the best marketplace and price, photographing and listing, cross-posting to marketplaces without APIs, generating shipping labels on sale, and tracking which books to buy or hold. Each step lives in its own tool. There is no single system that ties intake, intelligence, listing, fulfillment, and investment decisions together.

### 1.3 Target users

**Long-term:** Graded comic resellers ranging from solo operators (10–100 books/month) to small dealerships (500+/month).

**Initial release:** Two users in a single household across iOS and Android. The system is architected for multi-tenancy from day one so external users and organizations can be onboarded later without a data migration. Public launch is a later phase, not v1.

### 1.4 Outcomes

- Reduce per-book intake-to-listed time from ~15 minutes to under 3 minutes
- Eliminate manual pricing research by surfacing recommended prices automatically
- Provide data-backed buy/sell/hold recommendations for portfolio decisions

---

## 2. Goals and non-goals

### In scope (v1)

- Cross-platform mobile app (iOS + Android) via Expo
- Desktop web companion with feature parity (except QR scanning, which remains mobile-native)
- QR-based cert lookup for CGC and CBCS slabs
- Pricing intelligence from GoCollect and eBay
- Rules-based auto-listing to eBay with manual-review fallback
- Cross-post packet generation for marketplaces without listing APIs
- Shippo integration for shipping labels on sale
- LLM-powered investment advisor (buy / sell / hold recommendations)
- Multi-tenant architecture from day one (one organization in early phases; external organizations onboarded in a later phase)

### Out of scope (v1)

- Raw (ungraded) comic cataloging
- Buyer-side features (purchasing from within the app)
- Direct API listing on Heritage, ComicConnect, MyComicShop, Whatnot — no public APIs exist
- Storage-location tracking, accounting, or tax reporting (export data to external tools)
- Graders other than CGC and CBCS (e.g. PGX, CGG)
- Public-facing marketplace; inventory is private

---

## 3. Personas

**Active reseller (primary).** Buys and sells weekly. Receives 5–20 slabs per week from mixed sources. Goal: maximize margin and turnover while minimizing time per book. Device: iPhone. Will configure pricing rules and review high-value listings personally.

**Family collaborator (secondary).** Helps process inventory and ship sold items. Lower technical comfort. Device: Samsung Android. Needs simple flows; should not be able to modify pricing rules or delete records.

Both users share a single inventory.

**External reseller (future, post-public-launch).** Independent reseller or small dealership signing up for an account. May invite their own staff. Brings their own eBay, Shippo, and GoCollect credentials. Their inventory and data are completely isolated from other organizations. May range from a hobbyist with 20 books a month to a dealer with 500+.

---

## 4. Core user flows

### 4.1 Intake and catalog — target <60 seconds

1. User opens app, taps **Scan**
2. Camera opens; user points at the slab's QR code
3. App reads the cert number and calls the `cert-lookup` edge function
4. Function returns title, issue, variant, grade, grader, key notes, encapsulation date
5. App shows preview; user confirms or edits any field
6. In parallel, app fetches pricing comps from GoCollect and eBay
7. Comic saved to catalog with status `in_inventory`

### 4.2 List and publish — target <3 minutes including photos

1. From a catalog entry, user taps **Create listing**
2. App prompts for photos: front, back, slab top-down, signature/key page
3. Photos uploaded to Supabase Storage
4. App generates a draft listing (title, description, item specifics, suggested price band)
5. Decision branch:
   - Matches an auto-publish rule → publishes to eBay immediately
   - Otherwise → shows draft for review; user confirms; app publishes
6. If user opts to cross-post, app shows formatted packets for other marketplaces with copy buttons

### 4.3 Sale and fulfillment

1. eBay fires sold webhook to Supabase edge function
2. Function updates the comic's status to `sold` and creates a `sales` record
3. Function calls Shippo to generate a label from the buyer address
4. Label PDF saved to storage; user receives push notification
5. User prints label and ships; Shippo webhooks update tracking status

### 4.4 Investment advisor

1. User opens **Advisor** tab
2. Scheduled weekly job has already gathered: inventory snapshot, GoCollect market movements, news feed, sales velocity
3. Edge function builds a structured prompt and calls Claude API
4. App displays ranked recommendations:
   - **Watch / buy:** books trending up that you don't own
   - **Sell now:** books in inventory that have peaked or hit news-driven spikes
   - **Hold:** books still trending up that you already own
5. User can ask follow-up questions in chat mode

---

## 5. Functional requirements

### 5.1 Authentication, organizations, and roles

- Email + password via Supabase Auth (OAuth providers can be added later)
- **Organizations** are the primary tenancy unit. Every comic, listing, sale, rule, and advisor run is scoped to one organization. Users belong to one or more organizations via the `org_members` table.
- **Roles within an organization:**
  - `owner` — full access; can invite users, set roles, configure integrations, modify rules, delete the org
  - `admin` — same as owner except cannot delete the org or transfer ownership
  - `helper` — can scan, list, and ship; cannot modify rules, integrations, or delete records
- A new user signing up automatically gets a personal organization where they are the `owner`
- Invitations are sent by email with a single-use token; recipient creates an account or signs in to accept
- Every mutating action records `org_id`, `created_by`, and timestamp
- Row-level security on every table scoped by `org_id` — cross-tenant data leakage is prevented at the database layer, not the application layer

### 5.2 Cataloging

- Scan CGC or CBCS QR; auto-populate from cert lookup
- Manual entry fallback for failed lookups or older slabs without QR
- Editable fields: cert number, grader, title, issue, variant, year, grade, key notes, encapsulation date, acquisition cost, acquisition date, acquisition source, photos
- Search and filter by title, grade range, status, key status, acquisition window

### 5.3 Pricing intelligence

- Auto-fetch comps from GoCollect on catalog (90-day window)
- Auto-fetch eBay active listings via Browse API; sold comps via Marketplace Insights if approved
- Maintain `price_history` per cert: rolling average, median, low, high, sample count
- Weekly scheduled refresh job
- Display 30/60/90-day price bands, sample size, last sale price and date

### 5.4 Listing automation

- Generate eBay listing draft from comic data and photos
- Pre-fill title (templated from issue + grade + key notes), category, item specifics, description
- Reference pre-configured eBay business policies (payment, shipping, return) by ID
- **Rules engine** for auto-publish vs review:
  - Conditions: grade range, key status, comp sample size, comp variance
  - Action: `require_review` or `auto_publish`
  - Price formula: derived from comps (e.g., 90-day median × 0.95)
  - Example default rules:
    - Grade ≥ 9.0 AND key issue → require review
    - Comp sample < 5 → require review
    - Otherwise → auto-publish at 90-day median × 0.95
- Track listing status: `draft`, `pending_review`, `published`, `sold`, `ended`
- Cross-post packet generator: produces formatted blocks for Heritage, MyComicShop, Whatnot copy-paste

### 5.5 Shipping

- eBay sold webhook triggers Shippo label creation
- Use saved package presets (e.g., single-slab box, multi-slab flat)
- Generate label PDF, save to storage, send push notification
- Update sale record with tracking number; surface delivery status via Shippo webhooks

### 5.6 Investment advisor

- Weekly scheduled job pulls:
  - Current inventory value (sum of `price_history` medians)
  - GoCollect market index movements
  - News from RSS feeds (Bleeding Cool, Deadline, Variety, ScreenRant)
  - Sales velocity for issues on a watchlist
- Builds structured prompt for Claude API including inventory snapshot and market signals
- Returns ranked buy / sell / hold recommendations
- Stores `advisor_runs` so accuracy can be evaluated over time
- Chat mode allows the user to ask follow-up questions against the same context

### 5.7 Photos

- In-app camera capture, minimum 3 photos per listing
- Auto-crop and color-correct slab photos
- Compress to <500 KB before upload
- Stored in Supabase Storage with signed URLs for eBay upload

### 5.8 Notifications

- Push on: new sale, shipment delivered, weekly advisor digest, eBay listing rejected
- Per-user configurable

### 5.9 Web app

A Next.js web companion deployed to Vercel, sharing the same Supabase backend as the mobile app. Full feature parity with mobile except QR scanning. The web app takes advantage of the larger canvas for bulk operations and detailed analysis.

- Sidebar navigation: Dashboard, Catalog, Listings, Sales, Advisor, Settings
- Bulk operations in catalog: multi-select for batch listing, batch status updates, CSV export
- Wider data tables with sortable columns and inline editing where appropriate
- Side-by-side comparison view: compare two or more comics' price histories on one screen
- Keyboard shortcuts for common actions (`/` to focus search, `g c` to go to catalog, `n` to start new entry)
- Hover states for additional context (e.g., hover a price to see comp source breakdown)
- Deep links: every comic, listing, and sale has a stable URL so users can open multiple browser tabs
- Manual entry as primary intake path on web (no QR scanner); cert numbers can be typed or pasted in bulk for batch enrichment
- Webcam scan fallback (post-v1): use `@zxing/browser` for users with a desktop scanner station

---

## 6. Non-functional requirements

| Area | Target |
|---|---|
| App cold start | <2 seconds on a recent phone |
| Web app first contentful paint | <1.5 seconds on broadband |
| QR scan to enriched preview | <3 seconds |
| Catalog list rendering | Instant up to 5,000 entries |
| Backend uptime | 99% (covered by Supabase) |
| Offline mode | Catalog viewable offline; scans queued |
| Security | All API keys in Supabase Vault, never in client; row-level security; OAuth tokens encrypted at rest |
| Tenant isolation | No row from one organization is ever returned to a user in another organization; enforced by Postgres RLS, verified by automated tests |

### 6.1 Cost estimate (initial monthly)

| Item | Cost |
|---|---|
| Supabase Free tier | $0 |
| GoCollect API | Tier-dependent |
| Anthropic API (advisor + listing copy) | ~$10–20/mo |
| Apple Developer | $99/yr |
| Google Play | $25 one-time |
| eBay, Shippo | Existing accounts |

---

## 7. Technical architecture

### 7.1 Stack

- **Mobile frontend:** Expo (React Native), TypeScript
- **Web frontend:** Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Supabase (Postgres, Auth, Storage, Edge Functions) — shared by both clients
- **LLM:** Anthropic Claude API
- **Monorepo:** Turborepo with shared `packages/types` (generated Supabase types), `packages/api` (Supabase client + query helpers), `packages/lib` (shared business logic such as rule evaluation)
- **Distribution:** EAS Build for mobile (TestFlight, Play Console internal); Vercel for web

### 7.2 Edge functions

| Function | Purpose |
|---|---|
| `cert-lookup` | Takes cert number, queries CGC/CBCS verify, returns normalized data |
| `pricing-refresh` | Pulls GoCollect + eBay comps for a comic; on-demand + scheduled |
| `listing-create` | Generates eBay payload, applies rules, publishes or drafts |
| `ebay-webhook` | Receives eBay sale events; triggers Shippo + status update |
| `shippo-create-label` | Generates label from sale + buyer address |
| `advisor-run` | Builds context, calls Claude, stores recommendations |

---

## 8. Data model

Key tables (Postgres). Every domain table has an `org_id` foreign key and a row-level security policy that filters by the caller's organization membership.

**`organizations`** — id, name, created_at, created_by, plan (`free` | `pro` | `dealer`), status (`active` | `suspended`)

**`users`** — id, email, created_at, last_seen_at

**`org_members`** — id, org_id, user_id, role (`owner` | `admin` | `helper`), invited_by, joined_at

**`org_invitations`** — id, org_id, email, role, token, expires_at, accepted_at

**`org_integrations`** — id, org_id, provider (`ebay` | `shippo` | `gocollect`), credentials (encrypted jsonb), connected_at, last_used_at

**`comics`** — id, **org_id**, cert_number, grader (`CGC` | `CBCS`), title, issue, variant, year, grade, key_notes (text[]), encapsulation_date, acquired_at, acquired_cost, acquired_source, status (`in_inventory` | `listed` | `sold` | `gifted`), created_by, created_at

**`photos`** — id, **org_id**, comic_id, storage_path, position (`front` | `back` | `slab` | `other`), uploaded_at

**`price_history`** — id, **org_id**, comic_id, source (`gocollect` | `ebay`), price, sale_date, grade_matched, fetched_at

**`listings`** — id, **org_id**, comic_id, marketplace, marketplace_listing_id, status (`draft` | `pending_review` | `published` | `sold` | `ended`), asking_price, title, description, created_at, published_at

**`sales`** — id, **org_id**, listing_id, sold_price, sold_at, buyer_id_external, shippo_label_id, shipped_at, delivered_at

**`listing_rules`** — id, **org_id**, name, conditions (jsonb), action (`auto_publish` | `require_review`), price_formula, priority, active

**`advisor_runs`** — id, **org_id**, run_at, context_snapshot (jsonb), recommendations (jsonb)

**Row-level security pattern:** every domain table gets a policy like `org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.uid())`. This is enforced by Postgres regardless of how queries are issued — application bugs cannot leak cross-tenant data.

---

## 9. External integrations

| Service | Purpose | Method | Risks / Notes |
|---|---|---|---|
| CGC verify | Cert enrichment | Page scrape (no public API) | ToS gray area; rate-limit conservatively; manual fallback required |
| CBCS verify | Cert enrichment | Page scrape | Same as CGC |
| GoCollect API | Pricing comps | REST, paid tier | Tier rate limits; choose tier based on monthly call volume |
| eBay Browse API | Active comps + draft research | REST | Free; gives active listings only |
| eBay Sell API | Listing + fulfillment | REST + OAuth | Requires business policies pre-configured; **each organization connects their own eBay account** via OAuth |
| eBay Marketplace Insights | Sold comps | REST, gated | Apply for access early; Browse API as fallback |
| Shippo API | Shipping labels | REST + webhooks | **Each organization connects their own Shippo account** via API key |
| Anthropic Claude API | Investment advisor, listing copy | `messages` endpoint | Cost scales with token volume; shared platform key in early phases, per-org budgets later |
| RSS (Bleeding Cool, Deadline, Variety, ScreenRant) | News signal for advisor | Parse RSS | None |

---

## 10. Phased roadmap

**Development approach:** AI-assisted solo development (Cursor, Claude Code, Claude API for prompt iteration). Estimates below assume focused full-day work; halve velocity for evenings-only. Estimates do not include external waiting time (e.g., eBay Marketplace Insights approval, Apple Developer verification) — start those processes in parallel with Phase 1.

**Week 1 prototype goal:** end-to-end scan-to-catalog loop. Scan a CGC QR, get cert-lookup enrichment back, save the comic to Supabase, view it in a list. No photos, no pricing, no listing yet — just prove the core data path works. Everything else builds on this foundation.

| Phase | Scope | Estimated effort |
|---|---|---|
| 1. Catalog MVP | Expo app skeleton, QR scan, cert lookup, manual fallback, Supabase auth + DB | 3–5 days |
| 2. Pricing intelligence | GoCollect + eBay Browse integration; price_history; UI | 3–4 days |
| 3. Listing automation | eBay Sell API, rules engine, photo capture, cross-post packets | 1–2 weeks |
| 4. Fulfillment | eBay webhook, Shippo label creation, sale tracking | 2–3 days |
| 5. Investment advisor | Claude integration, scheduled context job, advisor UI + chat | 4–5 days |
| 6. Polish & distribution | EAS Build, TestFlight + Play Store internal, push notifications | 4–5 days |
| 7. Web companion | Next.js setup in monorepo, sidebar nav, dashboard, catalog with bulk ops, comic detail, listing review, sales, advisor, settings, deploy to Vercel | 1–2 weeks |
| 8. SaaS launch readiness | Org invitations and management UI, per-org integration credentials, self-serve onboarding, Stripe billing, marketing site, privacy policy, terms of service | 2–3 weeks |

**Total to v1 (Phase 1–7):** roughly 5–8 weeks of focused work.
**Total to public launch (Phase 1–8):** roughly 7–11 weeks of focused work.

Phase 3 (listing automation) remains the long pole — eBay's Sell API has the most state to wrangle and AI tooling speeds it up less than the rest. Plan accordingly.

---

## 11. Success metrics

- **Per-book intake time:** <60 seconds (vs ~5 min baseline)
- **Per-book list time:** <3 minutes including photos (vs ~15 min baseline)
- **Auto-publish rate:** 60%+ of low-grade non-key inventory listed without manual review
- **Advisor accuracy:** track 6-month price movement on buy recommendations vs non-recommended issues
- **Margin improvement:** 5%+ vs pre-app baseline asking prices

---

## 12. Open questions and risks

- **CGC verify scraping legality.** ToS gray area; mitigation = personal use only, conservative rate limit, prominent manual-entry fallback.
- **eBay Marketplace Insights approval.** Required for true sold comps; mitigation = apply early; use Browse + `price_history` as fallback if denied.
- **Photo quality variance between users.** Mitigation = in-app capture guide overlay with positions for front, back, top, key page.
- **App Store review.** Graded comic apps are unusual but not prohibited; risk low. Have privacy policy ready.
- **GoCollect API tier selection.** Need to estimate weekly comp refresh volume before committing.
- **eBay business policies.** Must be pre-configured by user before listing flow works; consider in-app prompt during onboarding.
- **Pricing model for external users.** Free tier with caps? Flat monthly fee? Per-book transaction fee? Needs decision before Phase 7.
- **Per-org API cost handling.** Anthropic and GoCollect calls cost real money per request. Options: pass through (BYO API keys), absorb (bundle in plan price), hybrid (free tier limited, pro tier higher caps). Decision affects pricing model.
- **CGC verify scraping at scale.** Acceptable for personal use; multiplying by N external organizations changes the risk profile and may require negotiating an official data partnership with CGC or relying entirely on user-entered data for external orgs.
- **Support burden.** External users will hit edge cases (older slabs, failed lookups, eBay listing errors). Plan for at least a help center and email support channel before public launch.
- **Terms of service and privacy policy.** Required for App Store / Play Store public listing and for handling other people's data. Get these reviewed by a lawyer before Phase 7.

---

## 13. Future (v2+)

- Raw comic cataloging with barcode scanning against GCD/ComicBookDB
- Additional graders (PGX, CGG)
- Buyer-side wishlist + price alerts on watched issues
- Direct integrations with marketplaces if listing APIs open up
- Team features for dealerships: seat management, audit log, role-based permissions beyond the three basic roles
- Convention mode: bulk intake from a buy session, batch processing
- Inventory aging report: time-on-hand per book, suggested markdowns
- Org-to-org features: consignment workflows, dealer-to-dealer wholesale
- White-label option for large dealerships
