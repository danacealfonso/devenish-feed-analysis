# Devenish Insights Portal: Feed Analysis prototype

Upload raw lab and NIR feed analyses, and compare them to each diet's formulation. Deviations are flagged by location, flock phase and diet.

- **Live prototype:** https://devenish-a4843.web.app (create an account at `/signup`, then sign in with email + password)
- **Notes (decisions, data issues, questions):** [NOTES.md](NOTES.md)

## Stack
| | |
|---|---|
| App | Next.js 15 (App Router, static export), TypeScript, Tailwind v4, Recharts |
| Parsing | SheetJS, running in the browser (`lib/parsers`) |
| Backend | Supabase: Postgres + RLS, Auth (email + password), Storage for raw files |
| Hosting | Firebase Hosting (`devenish-a4843`) |

## Run locally
```bash
cp .env.example .env.local   # publishable Supabase URL/key
npm install
npm run dev                  # http://localhost:3000
npm test                     # parser + analysis tests against the sample workbook
```

## Database
Migrations live in `supabase/migrations`:

| File | Contents |
|---|---|
| `…01_init.sql` | tables |
| `…02_rls.sql` | row-level security, the new-user → demo-org trigger, and the storage bucket |
| `…03_import_rpc.sql` | `import_feed_upload()`: an atomic import that dedupes duplicates and only fills gaps when it merges |
| `…05_questions.sql` | producer ↔ nutritionist question threads |
| `…06_roles_invitations.sql` | producer / nutritionist / admin permissions, invitations, profiles |
| `…04_demo_seed.sql` | **generated** from `tests/fixtures/sample-data.xlsx` by `npm run seed:build`, using the same parsers as the app |

```bash
supabase link --project-ref gyjmiqwkubvhqrxoeftd
supabase db push           # schema + demo data
supabase config push       # auth site URL + email-confirmation redirect URLs from supabase/config.toml
```

## Deploy
```bash
npm run build && firebase deploy --only hosting
```

## Code map
```
lib/parsers/      detect → parse the 4 sheet layouts → ParsedSample[] + warnings
lib/analysis/     % of intended, watch/action/suspect status, flags, stats, dedupe/merge, phase inference
lib/import/       builds the RPC payload (shared by the upload dialog and the seed script)
lib/data/         session, customer switcher, data loading (client-side, RLS-scoped)
components/feed/  headline cards, needs-attention list, dot plot, deviation matrix, stats table, upload dialog
app/(portal)/     /overview, /dashboard, /compare, /data, /feed, /feed/diet, /questions, /reports,
                  /operation, /operation/team, /settings/tolerances, /admin
app/              /login, /signup, /forgot-password, /reset-password, /auth/callback
```
