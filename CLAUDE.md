@AGENTS.md

# DAMS Meetup #14 — interactive discussion app

A real-time discussion app for **荷兰华人数据群 Meetup 第14期** (DAMS, Netherlands), 2026-05-09 12:45-18:00 Europe/Amsterdam. Single-event scope. ~100-300 attendees expected.

## Core value
Let attendees broadcast their needs/offers (求助 / 组队 / 内推 / 观点 / Q&A) to all 200 people in real time, instead of being limited to "only the 5 people sitting near them."

## Stack
- **Next.js 16.2.4** (App Router, Turbopack default — read AGENTS.md for v16 breaking changes)
- **Supabase** — Postgres + Realtime (no Supabase Auth)
- **Cloudflare Workers** via `@opennextjs/cloudflare` (Pages doesn't fit; Workers does, peer-dep `>=16.2.3`)
- **Tailwind v4** + TypeScript

## Identity model — IMPORTANT
We use **NO auth**. Two layers instead:
1. **Event password gate** (global, single string, configured via env). Validated by `proxy.ts`. Cookie expires when event window ends + 7 days.
2. **Browser UUID** (`crypto.randomUUID()`) stored in cookie + `localStorage`. Each browser is a "user" in the `users` table. Identity disclosure on each post is opt-in (anonymous by default; user can fill nickname+company; persisted in users row).
3. **Recovery URL** — at end of event the "我" tab shows `?u=<uuid>&t=<recovery_token>` so users can regain identity from another device within 7 days.
4. **VIPs** (~10) — visit a pre-issued `?vip=<token>` URL once; their `users.id` becomes linked to a `vip_tokens` row; their posts auto-display real name + title.

DB writes from Next.js server only, using Supabase **service role key** (bypasses RLS). Client only uses **anon key** for Realtime subscriptions (read-only via permissive RLS policies).

## Features (MVP for 5/9)
- Single timeline (no categories) — text posts ≤300 chars, free-form tags
- Tag filter chips
- Reply + like
- VIP-only **poll posts** (single/multi choice, deadline, hide-results-until-voted)
- "我" tab — my posts + replies received + recovery link + edit profile
- "撮合" tab — read-only view of `matches` table (AI-computed)
- `/screen` route — projection mode (auto-scrolling timeline + poll takeover)
- AI matching service — Supabase Edge Function + pg_cron every 5 min calls DeepSeek; failures isolated to "撮合" tab

## Folder layout
```
src/
  app/
    page.tsx              # password gate (or redirect if cookie set)
    (gated)/
      layout.tsx          # cookie check + identity bootstrap
      page.tsx            # timeline (default tab)
      me/page.tsx         # 我
      matches/page.tsx    # 撮合
    screen/page.tsx       # projection
  proxy.ts                # password gate enforcement (Node.js runtime)
  lib/
    supabase/{server,client}.ts
    identity.ts           # cookie/UUID helpers
    constants.ts          # event config
  components/             # PostCard, Composer, etc.
supabase/
  migrations/0001_schema.sql
```

## Env vars (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...           # server only, never NEXT_PUBLIC_
EVENT_PASSWORD=...                       # set per event, displayed at venue
DEEPSEEK_API_KEY=...                     # for AI matching edge function
NEXT_PUBLIC_EVENT_NAME=荷兰华人数据群 Meetup 第14期
NEXT_PUBLIC_EVENT_START=2026-05-09T12:45:00+02:00
NEXT_PUBLIC_EVENT_END=2026-05-09T18:00:00+02:00
NEXT_PUBLIC_EVENT_ORGANIZER=DAMS
```

## Deployment target
- Production URL: `meet.zhaidewei.com` (CNAME to CF Workers)
- Adapter: `@opennextjs/cloudflare`
- Storage: Supabase only (Postgres + Realtime); no R2/D1 needed

## v16 quick reminders (full list in AGENTS.md → docs)
- `middleware.ts` → **`proxy.ts`** (Node.js runtime, no edge)
- `await cookies()` / `await headers()` / `await params` / `await searchParams`
- `revalidateTag(tag, profile)` — second arg required
- New: `updateTag()` for read-your-writes in Server Actions
- `next lint` removed — use `eslint` CLI directly

## Status & resume (snapshot 2026-04-25)

### Done & code-complete
- Scaffolded with Next.js 16.2.4 / Tailwind v4 / TS / App Router (Turbopack default)
- Supabase schema written + **applied to live DB**: `supabase/migrations/{0001_schema,0002_realtime}.sql`
- Identity helpers (`src/lib/identity.ts`): UUID cookie, password cookie, recovery URL handler, `ensureUser`, `getCurrentUser`
- Password gate `/` with form action; recovery `?u=&t=` flow via **route handler `/recover`** (Server Components can't write cookies)
- Route gate (`src/proxy.ts`) — `/`, `/recover` are public
- Feed: composer (`PostComposer`), post card (`PostCard`), like (`LikeButton` with optimistic update), reply section (`ReplySection`)
- Server actions: `createPostAction`, `toggleLikeAction`, `createReplyAction`, `updateProfileAction`
- Feed data fetching `fetchFeed` (author + replies + like counts joined; supports `authorId` filter)
- `/me` tab — profile edit form, recovery URL with copy button, replies-to-me list, my-posts list (reuses `PostCard`)
- Stub pages: `/matches`, `/screen` (placeholders)
- Header with tab nav
- UI: removed scaffold's `prefers-color-scheme: dark` override + forced `color-scheme: light` (was causing white-on-white form fields under macOS dark mode)

### Verified
- `tsc --noEmit` passes
- `npx eslint src` passes
- Dev server boots
- Password gate → `/feed` works
- Recovery link works cross-browser (uid + token URL, valid 7 days post-event)

### NOT yet verified
- Profile edit save round-trip in `/me`
- Posting / liking / replying end-to-end (rendered, but not user-confirmed)
- Cross-user replies-to-me display (no second user has posted yet)

### Known quirks (don't relitigate)
- User's `~/package.json` + `~/package-lock.json` + `~/node_modules` moved to `~/.home-pkg-backup/` because Turbopack v16 workspace detection conflicts even with `turbopack.root` set explicitly. Restore (`mv ~/.home-pkg-backup/* ~/`) only after dev confirmed stable, and re-clear `.next` if errors return.
- `.next` cache must be cleared (`rm -rf .next`) if Turbopack picks up stale state after config or env changes.
- `@supabase/ssr` is installed but unused; we go straight to `@supabase/supabase-js` since we don't have Supabase Auth. Safe to leave.

### Secrets (in macOS Keychain via `secret`)
- `dams-event-password` — global event password
- `supabase-dams-url`, `supabase-dams-anon`, `supabase-dams-srv` — Supabase project (anon = legacy `anon public`, srv = `service_role`)
- `supabase-dams-public-key` — new-style "publishable" key (currently unused; keep)
- `supabase-dams-db-password` — only for SQL Editor / direct DB access
- `deepseek-dams-key` — for AI matching (not yet wired)

### How to resume
```bash
cd ~/dams-meetup
npm run dev          # → ./scripts/dev.sh injects secrets, starts on :3000
# If first run after pause, also: rm -rf .next
```
Then point Claude at this file: it contains all the architectural decisions and current state.

### Task queue (in priority order)
1. VIP polls (task #6) — token-claim flow (`?vip=<token>`), poll composer for VIPs, vote UI
2. `/screen` projection mode (task #7) — auto-scroll feed + poll takeover
3. AI matching service (task #12) — Supabase Edge Function + pg_cron + DeepSeek call → `matches` table; isolated failure
4. `/matches` tab (task #13) — read `matches` table; graceful empty state
5. Supabase Realtime wiring (task #8) — live INSERTs on posts/replies/likes
6. CF Workers deploy via `@opennextjs/cloudflare` (task #9) — env vars, custom domain `meet.zhaidewei.com`

### Recently shipped
- 2026-04-25: `/me` tab + recovery route handler + UI dark-mode contrast fix

## Out of scope (v1)
- DM / messaging — replaced by L1 contact-handle reveal on post
- Multi-event / multi-tenant — single conference
- Email infrastructure — recovery via URL only, no Resend/SMTP
- AI matching during the event being on the critical path — graceful degrade if DeepSeek fails
