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
- Production URL: `live.nl-dams.com` (custom domain on friend's CF account, zone `nl-dams.com`)
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
- Supabase schema written + **applied to live DB**: `supabase/migrations/{0001_schema,0002_realtime,0003_vip_login}.sql`
- Identity helpers (`src/lib/identity.ts`): UUID cookie, password cookie, recovery URL handler, `ensureUser`, `getCurrentUser`
- Password gate `/` with form action; recovery `?u=&t=` flow via **route handler `/recover`** (Server Components can't write cookies)
- VIP login `/vip-login` (username+password against `vip_tokens`); strict 1 VIP ↔ 1 users row, shared across devices via uid cookie reuse
- Route gate (`src/proxy.ts`) — `/`, `/recover`, `/vip-login` are public
- Feed: composer (`PostComposer`), post card (`PostCard`), like (`LikeButton` with optimistic update), reply section (`ReplySection`)
- VIP polls — `PollComposer` (only shown to VIPs in `PostComposer`), `PollCard` rendered inline in timeline; deadline hard-coded to `EVENT_END_ISO`; supports single/multi, hide-results-until-voted, change-vote
- Server actions: `createPostAction`, `toggleLikeAction`, `createReplyAction`, `updateProfileAction`, `vipLoginAction`, `createPollAction`, `voteAction`, `fetchScreenData`
- Feed data fetching `fetchFeed` (author + replies + like counts + poll vote counts joined; supports `authorId` filter)
- `/me` tab — profile edit form, recovery URL with copy button, replies-to-me list, my-posts list (reuses `PostCard`)
- `/screen` projection — 4-clock state machine: 1s ui tick / 8s timeline focus rotate / 30s slot (poll-vs-timeline) / 10s server polling. ActivePolls × 30s + timeline 30s, looped. Timeline focuses one post big + 2×2 grid below. PollSlot full-screen with bar charts + QR. Online-count from `users.last_seen_at` (5-min window, only `/feed` visits update it). Max-width 1400px to keep focal content centered on wide displays.
- Stub pages: `/matches` (placeholder)
- Header with tab nav
- UI: removed scaffold's `prefers-color-scheme: dark` override + forced `color-scheme: light` (was causing white-on-white form fields under macOS dark mode)

### Verified
- `tsc --noEmit` passes
- `npx eslint src` passes
- Dev server boots
- Password gate → `/feed` works
- Recovery link works cross-browser (uid + token URL, valid 7 days post-event)
- VIP login + poll create + vote end-to-end (single VIP user, one device)
- `/screen` renders timeline + poll layouts; QR shows; online count visible
- **Realtime end-to-end** — `/feed` 双标签验证：A 发帖，B 几秒内自动收到（无需手动刷新）。`scripts/diag-realtime.mjs` 验证 anon 订阅 posts/likes/replies 都收到 INSERT broadcast，`post_match_intents` 不广播给 anon

### NOT yet verified
- Profile edit save round-trip in `/me`
- Posting / liking / replying end-to-end (rendered, but not user-confirmed)
- Cross-user replies-to-me display (no second user has posted yet)
- VIP cross-device user reuse (only one device tested)
- `/screen` poll auto-rotation with 2+ active polls (only 1 poll tested)

### Known quirks (don't relitigate)
- User's `~/package.json` + `~/package-lock.json` + `~/node_modules` moved to `~/.home-pkg-backup/` because Turbopack v16 workspace detection conflicts even with `turbopack.root` set explicitly. Restore (`mv ~/.home-pkg-backup/* ~/`) only after dev confirmed stable, and re-clear `.next` if errors return.
- `.next` cache must be cleared (`rm -rf .next`) if Turbopack picks up stale state after config or env changes.
- `@supabase/ssr` is installed but unused; we go straight to `@supabase/supabase-js` since we don't have Supabase Auth. Safe to leave.
- **Realtime + `ALTER PUBLICATION` 缓存坑**：纯 SQL `alter publication supabase_realtime ...` 不会让 Supabase Realtime 服务重新加载 publication 状态，旧的内部状态会一直缓存住 → 表现为 "publication 看起来对，但 anon 订阅永远收不到 broadcast"。修复：Dashboard → Database → Publications → 点 `supabase_realtime` → 把目标表 toggle 一下（关再开）。以后改 publication 必须配合 Dashboard toggle，否则别 ship。
- **Realtime 不支持列白名单 publication**：PG 15 的 `add table foo (col1, col2)` 列白名单语法在 pg 层正确，但 Supabase Realtime 会静默丢掉这种 publication 的事件（订阅成功，永远收不到 broadcast）。结论：要隐藏字段就把字段搬到独立表（见 migration 0011 `post_match_intents`），不要用列白名单。
- **iPhone Chrome / iOS WebKit hydration 双坑**（debug 2026-05-03）：
  1. **Google Chrome iOS 自动注入** `__gcrremoteframetoken` 到 `<html>` 和 `__gcruniqueid` 到所有 `<form>`/`<input>`/`<textarea>`（Chrome iOS 跨页面 form auto-fill 内部机制，无法关闭）。Server render 没这些 attribute → React 看到 root-level mismatch → React 19 abort 整个 tree 的 hydration → 所有 `onClick`/`onChange`/`useState`/`useOptimistic` 都不工作，但 `<Link>` 导航和 native form submit 还能用（progressive enhancement 的天然 fallback）。修复：`<html suppressHydrationWarning>`（layout.tsx）+ 所有写操作走 React 19 form action（`action={formAction}`），而不是 `onSubmit`/`onClick`。
  2. **Next 16 `allowedDevOrigins` 默认不含 LAN IP**。从手机用 `http://192.168.68.x:3000` 访问 dev server 时，HMR WebSocket 等 `/_next/*` 请求会被 cross-origin block 返回 403 → HotReload 组件的 client state 对不上 SSR → 又一个 hydration mismatch。修复：`next.config.ts` 加 `allowedDevOrigins: ['<LAN-IP>']`，**改完必须重启 dev server**，hot reload 不会让这个生效。
  - 这两个一起表现为"iPhone Chrome 上所有按钮没反应、字符计数器不动、发帖按钮永远灰"。修代码前先确认是不是这俩。仅出现在 iPhone Chrome / iOS Safari，桌面浏览器从 localhost 访问不会触发。
  - **生产**只有 (1) 仍然存在（CF Workers 是 HTTPS 域名，没有 dev server cross-origin 问题），所以 form action progressive enhancement 是必要的、不能 revert。

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
1. ~~重新部署 match edge function~~ — **DONE**（2026-05-03 傍晚）— 用户跑了 `supabase functions deploy match`，含 redactContacts 兜底 + post_match_intents 读路径
2. ~~AI 撮合实现（方案 F''）~~ — **DONE**
   - ✅ slice 1: schema + 前端管道
   - ✅ slice 2: mock SQL 验 UI 链路（commit 92e7146）
   - ✅ slice 3: Edge Function + DeepSeek + pg_cron + match_runs 日志（commit f1bc1ca + 部署 2026-05-03 傍晚）
3. ~~`/matches` tab~~ — **废除**（F'' 决策；AI reply 内联到 feed）
4. ~~Supabase Realtime 接线~~ — **DONE**（issue #7，2026-05-03）
5. ~~CF Workers 部署收尾~~ — **DONE**（2026-05-05）— 部署到朋友 CF 账户 (`f1dc30bb93206c310ab2b840baceb857`) 的 `live.nl-dams.com`；本地 deploy + runtime secrets push + Workers Builds 接 GitHub repo 全部跑通
6. **端到端验证 match function 真跑通** — 部署完成但还没观测到 match_runs 表里有 success 行；至少塞 ≥3 条暗需求 mock 数据后等下一次 cron（5min），或 admin force token 手动触发，验证 DeepSeek 调用+ AI reply 写回

### Recently shipped
- 2026-05-05: **CF 部署切到朋友账户 `live.nl-dams.com` (PR #31)** — wrangler.jsonc pin `account_id` + custom_domain route；本地首次 deploy → runtime secrets push → Workers Builds 接 `zhaidewei/dams-meetup` repo 自动 build & deploy。朋友 CF 账户给的 role：`Workers Admin` + `Administrator Read Only`（后者补 Account Settings Read，否则 Workers Builds connect 会报权限错）。Build env vars (NEXT_PUBLIC_*) 必须在朋友 dashboard 单独配，不走 `scripts/deploy.sh` 的 Keychain 注入路径。
- 2026-05-03 傍晚: **issue #17 — 投票手动关闭 + DeepSeek 数据声明 + redact 兜底** — `closePollAction` 把 `poll_deadline` 提前到 now()（复用既有字段，无新状态列），PollCard 给作者显示「立即截止」按钮；`prompt.ts` 加 `redactContacts()`（邮箱/URL/≥10 数字串 → `[已隐藏]`），UI 显式声明数据流向 DeepSeek。`docs/matching-design.md` §8 完整字段清单。
- 2026-05-03 傍晚: **issue #15 — 联系方式一键复制** — PostCard / DmThreadView 展示对方联系方式时附复制按钮（复用 RecoveryLink 同款 CopyButton）。
- 2026-05-03: **Supabase Realtime 接线 (issue #7)** — `/feed` 双标签实测自动同步通过。`FeedRealtime` 客户端订阅 posts/replies/likes/poll_votes，500ms debounce 后 `router.refresh()`；`ScreenView` 同样改成 Realtime 触发 + 60s 兜底 interval。`match_intent` 整列搬到独立表 `post_match_intents`（migration 0011），物理隔离、不进 publication，不依赖 Realtime 内部行为。途中踩了两个坑：(a) PG 15 列白名单 publication Supabase Realtime 不支持，(b) `ALTER PUBLICATION` 后必须 Dashboard toggle 才能让 Realtime 重载 — 都记到 Known quirks。
- 2026-04-25: F'' 撮合 slice 1 — schema migration 0004 + PostComposer 暗字段 + ReplySection AiReplyRow + /me "有人想找你" + 删 /matches。**migration 待人工应用**。
- 2026-04-25: 基础夯实 — `docs/{architecture,schema,dev-setup}.md` + vitest（9/9 pass，含 Supabase smoke）
- 2026-04-25: AI 撮合方案设计定稿（方案 F''）— `docs/matching-design.md` + `docs/progress.md`
- 2026-04-25: `/screen` projection — slot state machine (poll takeover × N + timeline) + QR + online count; `qrcode` dep added
- 2026-04-25: VIP login (`/vip-login` username+password) + polls (create/vote/hide-results), strict 1-VIP-1-user across devices
- 2026-04-25: `/me` tab + recovery route handler + UI dark-mode contrast fix

## Out of scope (v1)
- DM / messaging — replaced by L1 contact-handle reveal on post
- Multi-event / multi-tenant — single conference
- Email infrastructure — recovery via URL only, no Resend/SMTP
- AI matching during the event being on the critical path — graceful degrade if DeepSeek fails
