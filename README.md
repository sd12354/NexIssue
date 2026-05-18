# NexIssue

Turborepo monorepo for the NexIssue mobile and web apps, shared packages, and Supabase backend.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 9+ (`corepack enable && corepack prepare pnpm@9.15.9 --activate`)
- [Expo Go](https://expo.dev/go) or a simulator for mobile development (optional)

## Setup

```bash
# Install all workspace dependencies
pnpm install

# Copy environment variables and fill in values
cp .env.example .env
```

## Development

Run both apps via Turborepo:

```bash
pnpm dev
```

Or run each app independently:

```bash
# Next.js web (http://localhost:3000)
pnpm dev:web

# Expo mobile (Metro bundler + QR code)
pnpm dev:mobile
```

From an app directory:

```bash
pnpm --filter web dev
pnpm --filter mobile dev
```

## Scripts

| Command | Description |
| --- | --- |
| `pnpm build` | Build all packages and apps |
| `pnpm dev` | Start dev servers (web + mobile) |
| `pnpm lint` | Lint all workspaces |
| `pnpm dev:web` | Web app only |
| `pnpm dev:mobile` | Mobile app only |

## Project structure

```
├── apps/
│   ├── mobile/     # Expo (SDK 50+) — React Native
│   └── web/        # Next.js 14 — App Router, Tailwind, ESLint
├── packages/
│   ├── api/        # Shared API client (placeholder)
│   ├── lib/        # Shared utilities (placeholder)
│   └── types/      # Shared TypeScript types (placeholder)
└── supabase/
    ├── migrations/ # Database migrations
    └── functions/  # Edge functions
```

## Supabase

Database migrations and edge functions live under `supabase/`. Use the [Supabase CLI](https://supabase.com/docs/guides/cli) for local development:

```bash
supabase start
supabase migration new <name>
```

## Environment variables

| Variable | Description |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous (public) key |
| `ANTHROPIC_API_KEY` | Anthropic API key for AI features |
