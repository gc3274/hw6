# Deconstructive Criticism Admin

The admin area for [Deconstructive Criticism](https://github.com/gc3274/hw1) (live at [hw1-two.vercel.app](https://hw1-two.vercel.app)), the app where AI critics roast what you made, score it out of 10 and leave one real tip.

It is a separate Next.js app on the same Supabase project and the same Google login as the main app. Only profiles with `is_superadmin = true` get in.

Stack: Next.js 16.3.5 (App Router, `proxy.ts`), React 19, Tailwind 4, Supabase (`@supabase/ssr` for the session, `@supabase/supabase-js` for the service role), Gemini through `@google/genai`, and vitest. Charts are hand-written SVG and HTML server components, with no chart library.

## What it covers

| Assignment requirement | Where |
|---|---|
| Creative statistics | `/` Overview, "How the panel is judging": how harsh each critic is on the 0 to 10 ruler, whether they stay in character, a critic leaderboard, which scores owners dare to post, how much posting inflates a photo's public score, crowd votes against critic scores, uploads per week, pipeline health and topics. Every chart has a "Show as table" view |
| Read users (profiles) | `/users` (search, superadmin filter, activity counts) and `/users/[id]` (account, posts, last 20 votes cast). No write controls |
| Create, read, update and delete AI-generated media | Roasts are the AI-generated media. `/media` lists them, `/media/new` generates a new roast with Gemini for a chosen post and critic, and `/media/[id]` shows one and lets you edit its words, tip, score and visibility, or delete it |
| Read votes and ratings | `/votes?view=votes` (the vote ledger, with self-votes flagged) and `/votes?view=ratings` (critic scores by critic and topic) |
| Read prompt chains | `/prompt-chains` and `/prompt-chains/[id]`. A prompt chain is the main app's roast pipeline (the course schema calls these humor flavors). Two are seeded: One pass, and Look, then roast |
| Read prompt chain steps | `/prompt-chains/[id]` lists each step in order with its model, temperature, thinking level, input and output, and full system and user prompt templates |
| Read and update the prompt chain mix | `/chain-mix`: one weight per chain, adding up to 100, saved in one write. Each roast run picks a chain by these weights |
| Create, read, update and delete terms | `/terms`. The top 30 for a photo's topic go into the roast prompt |
| Create, read, update and delete AI generation examples | `/examples` (example reviews). The top 5 for a photo's topic go into the roast prompt |
| Create, read, update and delete LLM models | `/llm-models`. Steps call a model's ID on the next run; a model a step uses can't be deleted |
| Create, read, update and delete LLM providers | `/llm-providers`. Only the `google` provider is callable by the app; a provider with models can't be deleted |
| Read generation requests | `/requests` and `/requests/[id]`: one row per roast run, from the main app or from here, with status, chain, timing and its model calls |
| Read LLM responses | `/llm-responses` and `/llm-responses/[id]`: one row per model call, with the prompts sent, the raw answer, the model that answered and any fallback |
| Create, read, update and delete allowed sign-up domains | `/signup-domains`. Checked for new accounts by the Supabase Before User Created hook |
| Create, read, update and delete whitelisted email addresses | `/whitelist`. Checked by the same hook |
| Create (with upload), read, update and delete images | `/images`, `/images/new` (upload a photo) and `/images/[id]` (edit its note, and its topic while it has no roasts; delete it with its roasts) |
| Every route behind Google sign-in plus `profiles.is_superadmin` | [Access control](#access-control) |
| The lockout question | [Won't the first admin be locked out?](#wont-the-first-admin-be-locked-out) |

Rules the roast pages keep:
- A roast the admin generates belongs to the post's owner and starts private, so it shows in the owner's review screen in the main app.
- Unpublishing is always allowed. Publishing is allowed only if the owner posted that roast before (`posted_at` is set), because a public roast makes its photo public.
- Legacy captions from Caption City are labelled "Legacy caption". Only their words and visibility can be edited, and legacy posts can't get new roasts.
- The uploader's note and the prompt are shown only on `/media/[id]`, labelled "Private, never shown in the app".

Rules the new pages keep:
- Chains and steps are read-only here; they come from the migration. What an admin can change is which chain runs (the mix), the models the steps point at, and the terms and examples that go into the prompts. Every change applies to the next roast run.
- Deletes that would break a run are refused with the reason: a provider that still has models, or a model a step still uses.
- A photo's topic is fixed once it has roasts (its critics were picked for that topic), and legacy caption photos stay legacy.
- Photos uploaded here belong to the admin who uploaded them, so they show on that admin's dashboard in the main app, and their roasts are posted from there.
- The sign-up pages always show who can sign up right now. Only new accounts are checked, so removing a domain never locks anyone out.

The tables and the sign-up hook come from the main app's migration `20261028120000_prompt_chains_and_observability.sql`.

## Routes

| Route | Who | What |
|---|---|---|
| `/login` | Everyone (GET only) | Google sign-in. A signed-in admin goes on to `/`, anyone else signed in to `/not-authorized` |
| `/auth/callback` | Everyone (GET only) | OAuth code exchange, then `/` or `/not-authorized` by the flag. Errors go to `/login?error=1`. There is no `next` parameter, so it can't redirect off-site |
| `/not-authorized` | Signed in | Your email, how to get access, and Sign out |
| `/` | Superadmin | Stats overview |
| `/users`, `/users/[id]` | Superadmin | Users (read) |
| `/images`, `/images/new`, `/images/[id]` | Superadmin | Images (create with upload, read, update, delete) |
| `/media`, `/media/new`, `/media/[id]` | Superadmin | Roasts (create, read, update, delete). `/media/new` has `maxDuration = 60` for the Gemini calls |
| `/votes` | Superadmin | Votes and ratings (read) |
| `/prompt-chains`, `/prompt-chains/[id]` | Superadmin | Prompt chains and their steps (read) |
| `/chain-mix` | Superadmin | The chain mix (read, update) |
| `/terms`, `/terms/new`, `/terms/[id]` | Superadmin | Terms (create, read, update, delete) |
| `/examples`, `/examples/new`, `/examples/[id]` | Superadmin | Example reviews (create, read, update, delete) |
| `/llm-models`, `/llm-models/new`, `/llm-models/[id]` | Superadmin | LLM models (create, read, update, delete) |
| `/llm-providers`, `/llm-providers/new`, `/llm-providers/[id]` | Superadmin | LLM providers (create, read, update, delete) |
| `/requests`, `/requests/[id]` | Superadmin | Generation requests (read) |
| `/llm-responses`, `/llm-responses/[id]` | Superadmin | LLM responses (read) |
| `/signup-domains`, `/signup-domains/[id]` | Superadmin | Allowed sign-up domains (create, read, update, delete) |
| `/whitelist`, `/whitelist/[id]` | Superadmin | Whitelisted email addresses (create, read, update, delete) |

Plus `not-found` and `error`. Every response sends `X-Frame-Options: DENY`, and the root layout sets `robots: noindex`.

## Access control

```
request: any method, any path except /_next/static, /_next/image, /favicon.ico, /icon.svg
  |
  v
1. proxy.ts -> lib/supabase/proxy.ts                         (optimistic, every request)
     getClaims(), then the caller's own is_superadmin read through RLS,
     then the decision table in lib/gate.ts:
       /login, /auth/callback   GET/HEAD pass; any other method -> 405
       /not-authorized          GET/HEAD pass; POST needs a session (sign out), else 401;
                                any other method -> 405
       every other path         signed out      -> 307 /login           (other methods 401)
                                flag false      -> 307 /not-authorized  (other methods 403)
                                flag unreadable -> 307 /not-authorized  (other methods 503)
                                flag true       -> pass
  |
  v
2. app/(admin)/layout.tsx: requireSuperadmin() + AdminShell  (UI only: layouts don't re-run on client navigation)
  |
  v
3. Every admin page and every server action starts with   (the real gate)
     await requireSuperadmin()        lib/dal.ts: getUser() + a fresh flag read,
                                      else redirect /login or /not-authorized
  |
  v
4. adminDb()                          lib/supabase/admin.ts: calls requireSuperadmin() again, then builds
                                      the service-role client. Imported only by lib/data/* and
                                      app/(admin)/**/actions.ts
  |
  v
Supabase with the service role (bypasses RLS)
```

Why each layer is there:
- **Server actions can be posted to any path.** Next resolves an action by its ID, not by the page it is posted to, and action IDs are visible in the public JS. So the proxy gates every method, not just page loads, and `/login` refuses POST outright. Even so, the first line of every action is what actually protects it.
- **The flag is read from the database on every request**, never kept in the JWT, so revoking it takes effect on the next click. A failed read counts as "no".
- **The proxy only ever redirects to `/login` or `/not-authorized`**, and both pages send you onward themselves, so there are no redirect loops.
- **The service key is server-only.** It is not `NEXT_PUBLIC_`, it is read in one file, and that file is `server-only`. The client is built with `@supabase/supabase-js` on purpose: an `@supabase/ssr` client would send the user's cookie token instead and silently run as the user.
- **The admin has its own auth cookie**, `sb-admin-auth-token`, so on localhost the main app (:3000) and the admin (:3001) never share a session.
- `signOut` (`app/auth/actions.ts`) is the only action without the check. It only ends the caller's own session.

Tests hold this in place:
- `lib/gate.test.ts` covers every row of the decision table.
- `lib/supabase/proxy.test.ts` runs the proxy itself: no redirect loops, the flag re-read on every request, and refreshed cookies and no-cache headers on every redirect and denial.
- `lib/architecture.test.ts` reads the source and fails if any admin page or server action doesn't open with `await requireSuperadmin()`, if anything else imports the service client, if the service key name appears outside `lib/supabase/admin.ts`, or if anything uses `dangerouslySetInnerHTML` or `"use cache"`.

## Won't the first admin be locked out?

It would be, if the admin area were the only way to set the flag, because the admin area itself requires the flag. So the first superadmin is set out-of-band: one SQL statement in the Supabase SQL editor (the bootstrap under [Setup](#setup)). The editor runs as the database owner, `postgres`, so it bypasses row level security, the column grants and the guard trigger.

Users can't promote themselves. The signed-in role has no insert or update grant on `is_superadmin`, and a trigger refuses a change to it from everyone else, including this admin area's own service key. A leaked key or a bug here can't mint admins, and the admin UI has no way to grant admin at all (profiles are read-only).

If every admin is ever lost, the same SQL editor path restores access, and only the Supabase project owner can reach it. Revoking is the same kind of statement and bites on the next request. The database owner, not the app, is the root of trust.

Two alternatives were turned down: an email allow-list in an env var (a second source of truth, and a way around the flag) and seeding an admin in a migration (that puts an email in git).

## Setup

The superadmin migration lives in the main app repo: [`supabase/migrations/20261021120000_superadmin.sql`](https://github.com/gc3274/hw1/blob/main/supabase/migrations/20261021120000_superadmin.sql). It adds `profiles.is_superadmin`, column-level insert and update grants on `profiles`, and the guard trigger.

1. **Run the migration.** Supabase Dashboard → SQL Editor → New query, paste the whole file and run it with the role picker on `postgres`, after the main app's three earlier migrations. Never re-run `20260930120000_profiles_and_avatars.sql` after it: that file grants table-level insert and update on `profiles` again.
2. **Verify it.** Check the editor's role, then the grants:

   ```sql
   select current_user, session_user, auth.jwt() ->> 'role' as jwt_role;
   -- expect: postgres | postgres (or supabase_admin) | null

   -- expect SELECT only at table level
   select privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated';
   -- expect INSERT and UPDATE on exactly the 6 writable columns, SELECT on all of them
   select privilege_type, column_name from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated'
    order by 1, 2;
   ```

   Then run the impersonation check from the main app README ([Superadmin flag](https://github.com/gc3274/hw1#superadmin-flag)) with a non-admin test account, and check that onboarding, the profile form and an avatar change still save in the main app.
3. **Bootstrap the first superadmin.** Sign in once with that Google account on the main app first, so it has an `auth.users` row. This matches on `auth.users.email`, never on `profiles.email`, which users can edit.

   ```sql
   insert into public.profiles (id, email, is_superadmin)
   select u.id, u.email, true
     from auth.users u
    where lower(u.email) = lower('<GOOGLE_EMAIL>')
   on conflict (id) do update set is_superadmin = true
   returning id, email, is_superadmin;
   -- Expect exactly 1 row. 0 rows means that account has never signed in.
   ```

   To revoke, and to list the admins:

   ```sql
   update public.profiles p set is_superadmin = false
     from auth.users u
    where u.id = p.id and lower(u.email) = lower('<THEIR_EMAIL>')
   returning p.id, u.email, p.is_superadmin;

   select p.id, u.email, u.last_sign_in_at
     from public.profiles p join auth.users u on u.id = p.id
    where p.is_superadmin;
   ```

4. **Environment.** Copy `.env.example` to `.env.local` and fill it in (never commit `.env.local`):

   | Name | Notes |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Same as the main app |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as the main app. Or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, which wins if both are set |
   | `SUPABASE_SERVICE_ROLE_KEY` | The `service_role` key or an `sb_secret_…` key. Server only: never give it a `NEXT_PUBLIC_` prefix. Read only in `lib/supabase/admin.ts` |
   | `GEMINI_API_KEY` | Server only. The main app's key works; both apps then share its quota |

   The model is not an environment variable any more: it comes from the prompt chain in the database, with `gemini-flash-lite-latest` tried once when a step's model is busy, missing or refuses the request.

5. **Run it.** `npm install`, then `npm run dev`, and open [http://localhost:3001](http://localhost:3001). The admin always runs on port 3001, next to the main app on 3000.
6. **Supabase redirect URLs.** Under Authentication → URL Configuration → Redirect URLs, add:
   - `http://localhost:3001/**`
   - the hw6 production domain, `https://<hw6-production-domain>/**`
   - the hw6 deployment URLs, `https://hw6-*-gc3274-3854.vercel.app/**` (this also covers each commit's own URL; check the real domains under the Vercel project's Domains)

   The Site URL stays the main app. Google Cloud needs no change: its redirect URI is Supabase's own `/auth/v1/callback`. If Google sign-in lands you on the main app instead of the admin, the admin URL is missing from this list.

## Deploy

1. Create the empty GitHub repo `gc3274/hw6`, add it as `origin` and push `main`.
2. In Vercel, import `gc3274/hw6` into the team `gc3274-3854` (framework Next.js, no settings changed).
3. Add the environment variables. Set `SUPABASE_SERVICE_ROLE_KEY` for **Production only** and mark it **Sensitive**. Preview deployments then have no key, and their data pages fail closed with an error instead of exposing anything.
4. Settings → Deployment Protection → Vercel Authentication: **Disabled**, so the URLs open without a Vercel login. The Google sign-in and the superadmin flag still guard every page.
5. Add the production domain and the deployment URL pattern to the Supabase redirect URLs (Setup step 6).
6. Check in an Incognito window: `/` goes to `/login`; signing in as the admin opens the overview; another Google account that already has an account lands on `/not-authorized`. A brand-new account outside the sign-up lists is stopped by the sign-up hook and lands on `/login?error=1` instead. Then revoke the flag in SQL and check that the next click goes to `/not-authorized`.

Every push to `main` deploys to production. Each production deployment also keeps its own commit-specific URL (`hw6-<hash>-gc3274-3854.vercel.app`), and that URL has the production environment, service key included.

## Scripts and checks

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 3001 |
| `npm run build` / `npm start` | Production build, and a server for it on port 3001 |
| `npm run lint` | ESLint |
| `npm test` | vitest: the gate, params, the form rules of every section, the prompt chain runner, formatting, stats and the architecture guards |
| `npx next typegen && npx tsc --noEmit` | Type check (route types such as `PageProps` are generated) |

After a build, the service key must not be anywhere in the client bundle. Both of these must print nothing:

```sh
grep -rlE "SUPABASE_SERVICE_ROLE_KEY|service_role|sb_secret_[A-Za-z0-9]" .next/static
# the key's value itself, read from .env.local without printing it
grep -rlF -- "$(sed -n 's/^SUPABASE_SERVICE_ROLE_KEY=//p' .env.local)" .next/static
```

The first pattern needs a character after `sb_secret_`, because supabase-js itself ships the bare prefix in the browser bundle (it checks `key.startsWith("sb_secret_")` to avoid sending such a key as a Bearer token). The second check only means something once the key is set: with an empty value it matches every file.

Signed-out checks against `npm start` (each must fail):

```sh
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3001/media   # 307 to /login
curl -s -o /dev/null -w '%{http_code}\n' -X PUT http://localhost:3001/media              # 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Next-Action: x' http://localhost:3001/login   # 405
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
  http://localhost:3001/media/00000000-0000-0000-0000-000000000000.png                   # 307 to /login
```

## Known limits

- **The proxy reads the database on every request.** Next's docs advise against database checks in the proxy, since it also runs for prefetches. It is accepted here because admin traffic is tiny and it makes revocation immediate. Any error counts as "no".
- **Revocation and open tabs.** Revoking the flag refuses the next request, but a page that is already rendered stays visible in an open tab until it is reloaded or left.
- **Supabase auth cookies are readable by JavaScript** (the `@supabase/ssr` default), so an XSS bug would expose the admin session. Roast text is always rendered as plain text, and no page renders raw HTML.
- **Generating roasts shares the main app's Gemini key and free-tier quota.** Admins have no daily cap. Admin runs are logged in `generation_requests` with source `admin` under the admin, so they never use up the owner's daily posts and the overview's pipeline stats leave them out. The free tier can be busy; the form says so.
- **Admin-generated roasts start private and can't be published from here**, because the owner never posted them. The owner can post them from the main app.
- **Edits keep the roast's votes and its `posted_at`,** and the words are still shown as the critic's. That is trusted admin power.
- **Deleting the last roast on a post** keeps the image row and the file. The post disappears from the public app, and its owner sees an empty post. Delete the photo itself from `/images/[id]`.
- **An abandoned upload leaves a file.** If the tab closes between the upload and the save on `/images/new`, the file stays in the admin's storage folder with no images row. Nothing links to it.
- **The overview's fallback share is a guess** from the model name (`lite`) stored on each roast. The exact record is `llm_responses.is_fallback`, on `/llm-responses`.
- **Logs are kept forever** and include each run's prompts, which contain the uploader's note. Only admins can read them.
- **A run cut off by the platform stays `pending`.** The requests pages show a pending row older than two minutes as "unfinished".
- **Stats read whole tables** in pages of 1,000 rows, up to 20,000 rows per table; past that the overview says which tables were cut short. At that size the totals should move into SQL.
- **Small numbers.** Counts are always shown, an average needs at least 2 scores, and the crowd verdict needs at least 5 voted roasts. Below that the charts say there isn't enough data yet.
- **Days and weeks use New York time.**
- **`profiles.email` is user-supplied.** The user detail page shows the sign-in email from Supabase Auth as the one to trust.
- **Signing in creates a user.** The first Google sign-in here creates an `auth.users` row and a profile in the shared project, the same as signing in to the main app, so it goes through the same sign-up hook.
- **Copied code can drift.** Some files are copied from the main app: `lib/roasts.ts`, `lib/chains.ts`, `lib/gemini.ts`, `lib/resize-image.ts`, part of `lib/captions.ts`, the Supabase clients, and the sign-in and sign-out code, plus the tests of the chain runner. Each starts with a comment naming the main app commit it came from. `lib/chains.ts` and `lib/gemini.ts` match the main app line for line after that comment, so `diff <(tail -n +2 lib/chains.ts) ../hw2/lib/chains.ts` should print nothing.
