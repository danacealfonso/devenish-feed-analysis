# Devenish Insights Portal: Feed Analysis prototype

Upload raw lab and NIR feed analyses, and compare them to each diet's formulation. Deviations are flagged by location, flock phase and diet.

- **Live prototype:** https://devenish-a4843.web.app (create an account at `/signup`, then sign in with email + password)
- **Notes (decisions, data issues, questions):** [NOTES.md](NOTES.md), also as a one-page PDF: [docs/Feed-Analysis-Notes.pdf](docs/Feed-Analysis-Notes.pdf)

## Demo accounts
Sign in at https://devenish-a4843.web.app/login. There is one account per role:

| Role | Email | Password | What you'll see |
|---|---|---|---|
| Devenish admin | `danacebboy@gmail.com` | `jLx-Bh6C-ypxB*x` | All customers, the **Admin** page (create customers), full editing |
| Nutritionist | `kanamits2@gmail.com` | `euRFJ2yke9zzNDV9` | Customers A, D and F; can edit tolerances, locations, mills and the team; *Preview as customer* switch |
| Farm team (producer) | `kanamits3@gmail.com` | `euRFJ2yke9zzNDV9` | **Customer A only**; can upload and ask questions; settings are read-only |

Roles are assigned in `supabase/migrations/…07_demo_accounts.sql`. A new sign-up without an invitation joins the demo customers as a nutritionist.

### What each role can do
| | Devenish admin | Nutritionist | Farm team |
|---|---|---|---|
| Who it's for | Devenish staff running the portal | Devenish feed expert looking after several farms | The farm owner and their staff |
| Customers visible | All | Assigned ones | Own farm only (no customer switcher) |
| View results, upload lab/NIR files, ask questions | ✓ | ✓ | ✓ |
| Change tolerances, locations, feed mills | ✓ | ✓ | Read-only |
| Mark questions answered | ✓ | ✓ | ✗ |
| Invite people | Anyone | Farm team or nutritionists | Farm colleagues only |
| Change roles / remove people | ✓ | ✓ | Can only leave |
| Create customers (Admin page) | ✓ | ✗ | ✗ |
| *Preview as customer* switch | ✓ | ✓ | n/a |

These rules are enforced in the database (row-level security and permission-checked functions), not just hidden in the UI. Invited people get access once they sign up with the invited email and it's confirmed.

## AI assistant
Every portal page has an **Ask about this data** button that opens a chat panel. It explains the current customer's feed results in plain language: what's off, by how much, why it matters for the hens, and what looks like a data problem rather than a feed problem.

- **Explain in context:** hover any flag in *Needs attention*, any cell in the deviation matrix, or any question, and a ✨ icon appears. Clicking it opens the panel and asks for an explanation of that item, checked against the diet's history, other locations and lab vs NIR. Questions also have an **Explain with AI** button. The wiring is `lib/assistant/ask.ts` and `components/assistant/AskAI.tsx`.
- **How it works:**
  - The browser builds a text snapshot of exactly what the portal shows: % of intended, statuses, flags, stats and tolerances (`lib/assistant/context.ts`).
  - The Supabase Edge Function `supabase/functions/assistant` checks that the user is signed in and can view that customer, enforces daily caps (40 questions per user, 500 overall; raised to 150 and 1,500 until 3 Oct 2026), and streams the answer from **Claude Opus 5**.
- **Cost controls:** the customer's data block is prompt-cached, so follow-up questions are cheap. Answers run at effort `medium`. Server-side refusal fallback (`fallbacks: "default"`) is enabled.
- **Setup:**
  ```bash
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
  supabase functions deploy assistant --use-api --no-verify-jwt
  ```
  `--no-verify-jwt` is set because the function verifies the user's token itself.

## Notifications
People find out there's something new without having to check the portal: a feed analysis upload, a new question, or a reply.

- **Push (Firebase Cloud Messaging):** turned on per browser from **Notifications** in the sidebar. While the portal is open, a message shows as a toast; when it's closed, as a system notification that opens the right customer and page.
- **Email:** the same events, sent from a Gmail account over SMTP. Each person can switch email off or send it to a different address than their sign-in email.
- **Badges:** **Data** and **Questions** in the sidebar show how many uploads, questions and replies arrived since you last looked. They update live (Supabase Realtime), and new rows are marked on those pages.
- **Settings:** per person, which events to be told about, applied to both channels. Nobody is notified about their own actions.
- **Limits:** at most 100 emails a day across the whole portal (`EMAIL_DAILY_CAP` secret to change it), because the demo logins are public and mail goes out from a real Gmail account. Test emails are limited to 10 an hour per person; test pushes to 10 an hour (60 until 7 Oct 2026 while the prototype is reviewed).
- **How it works:** after creating an upload, question or reply, the browser calls the `notify` Edge Function with its id. The function loads the item itself and only sends if the caller created it in the last 15 minutes. `notification_log` makes each send happen once (`supabase/functions/notify`, `…09_notifications.sql`, `lib/notifications/`, `public/firebase-messaging-sw.js`).
- **Setup:**
  ```bash
  # Firebase console → Project settings → Service accounts → Generate new private key
  supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat path/to/service-account.json)"
  # Gmail needs 2-Step Verification on, then an app password from myaccount.google.com/apppasswords
  supabase secrets set SMTP_USER=kanamits3@gmail.com SMTP_PASS='xxxx xxxx xxxx xxxx'
  supabase db push
  supabase functions deploy notify --use-api --no-verify-jwt
  ```
  The browser side needs the `NEXT_PUBLIC_FIREBASE_*` values in `.env.example`, including the Web Push (VAPID) public key from Firebase console → Project settings → Cloud Messaging.

## Stack
| | |
|---|---|
| App | Next.js 15 (App Router, static export), TypeScript, Tailwind v4, Recharts |
| Parsing | SheetJS, running in the browser (`lib/parsers`) |
| Backend | Supabase: Postgres + RLS, Auth (email + password), Storage for raw files, Realtime, Edge Functions |
| Notifications | Firebase Cloud Messaging (web push), Gmail SMTP |
| Hosting | Firebase Hosting (`devenish-a4843`) |

## Run locally
```bash
cp .env.example .env.local   # public Supabase and Firebase client config
npm install
npm run dev                  # http://localhost:3000
npm test                     # parser + analysis tests against the sample workbook
npm run e2e                  # Playwright browser tests against the live site (see below)
```

## Tests
- **Unit (`npm test`, Vitest, 34 tests):** detection and parsing of all 9 sample sheets, recalculated % of intended matched against the workbook's own values, stats, dedupe, flags.
- **End-to-end (`npm run e2e`, Playwright, 23 tests):** signs in as each demo role and checks every page, including:
  - filters and diet drill-down, flag filters, and the ✨ explain icons (model stubbed)
  - notification settings (changing the email address) and a live Questions badge when another user posts
  - CSV export
  - farm-team read-only restrictions
  - a real upload through the upload dialog
  - the admin console
  - phone-width layout

  Tests fail on any browser console error. Tests never send real notifications (the `notify` function is stubbed; `E2E_NOTIFY=1` lets them through). The assistant test that calls the real model is opt-in: `E2E_ASSISTANT=1 npm run e2e -- assistant`. They run against https://devenish-a4843.web.app by default; set `E2E_BASE_URL=http://localhost:3000` to test a local build. First run: `npx playwright install chromium`.

## Database
Migrations live in `supabase/migrations`:

| File | Contents |
|---|---|
| `…01_init.sql` | tables |
| `…02_rls.sql` | row-level security, the new-user → demo-org trigger, and the storage bucket |
| `…03_import_rpc.sql` | `import_feed_upload()`: an atomic import that dedupes duplicates and only fills gaps when it merges |
| `…05_questions.sql` | producer ↔ nutritionist question threads |
| `…06_roles_invitations.sql` | producer / nutritionist / admin permissions, invitations, profiles |
| `…07_demo_accounts.sql` | assigns the admin / nutritionist / farm-team demo accounts |
| `…08_assistant_usage.sql` | usage log behind the assistant's daily caps |
| `…09_notifications.sql` | notification settings, push tokens, seen markers and `unread_counts()` for badges, send log, Realtime publication |
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
lib/notifications/ push (Firebase), unread badges + Realtime, toasts, notify calls
components/feed/  headline cards, needs-attention list, dot plot, deviation matrix, stats table, upload dialog
app/(portal)/     /overview, /dashboard, /compare, /data, /feed, /feed/diet, /questions, /reports,
                  /operation, /operation/team, /settings/tolerances, /notifications, /admin
app/              /login, /signup, /forgot-password, /reset-password, /auth/callback
```
