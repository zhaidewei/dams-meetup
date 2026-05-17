# dams-meetup

荷兰华人数据群 Meetup 现场互动 app。Next.js 16 + Supabase + Cloudflare Workers。
当前部署在 `live.nl-dams.com`，正处于「再见态」（所有 UI 路由 308 → `/summary`）。

完整架构 / 开发笔记见：
- [`CLAUDE.md`](./CLAUDE.md) — 架构决策、stack、踩坑记录、任务队列
- [`docs/architecture.md`](./docs/architecture.md) / [`docs/schema.md`](./docs/schema.md)
- [`docs/next-event-bootstrap.md`](./docs/next-event-bootstrap.md) — 把再见态翻回 live 活动的 10 步
- [`docs/summary-2026-05-09/`](./docs/summary-2026-05-09/) — 第 14 期数据复盘归档

## Dev

```bash
npm run dev     # scripts/dev.sh 自动从 macOS Keychain 注入 secrets
```

## 数据库 reset / 重建

### Reset（保留 schema，清空数据）

活动落幕后清空业务数据，schema 不动。**不可逆**，跑前确认 summary 已经归档。

去 Supabase Dashboard → SQL Editor，粘贴 [`scripts/reset-event-data.sql`](./scripts/reset-event-data.sql) 跑。
末尾看到 `NOTICE: reset done: users=0 posts=0 event_state_clean=t` 即成功。

### 从快照恢复 / 在新项目里重建 schema

[`supabase/schema-snapshot.sql`](./supabase/schema-snapshot.sql) 是当前生产库 `public` schema 的 pg_dump（含 functions / triggers / RLS policies / publications），用 `supabase` CLI 跑的（本机 `pg_dump` 15 与 Supabase PG 17 版本不匹配）。

#### 场景 A：往**同一个 Supabase 项目**恢复（drop 干净之后）

```sql
-- Dashboard → SQL Editor
drop schema public cascade;
create schema public;
-- 然后粘贴 supabase/schema-snapshot.sql 全部内容
```

#### 场景 B：迁到**新的 Supabase 项目**（如老项目已删）

1. 新建 Supabase 项目，记下 project ref 和 db password
2. 恢复 schema：
   ```bash
   supabase db push --db-url "postgresql://postgres.<NEW-REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres" \
     --file supabase/schema-snapshot.sql
   ```
   或者 Dashboard → SQL Editor 粘贴 `schema-snapshot.sql` 跑
3. **重建 pg_cron 调度**（snapshot 不含 `cron.job` 行）：
   按顺序在 SQL Editor 跑 [`supabase/migrations/0009_match_cron.sql`](./supabase/migrations/0009_match_cron.sql)
   → [`0025_match_cron_phased.sql`](./supabase/migrations/0025_match_cron_phased.sql)
   → [`0027_match_cron_pre_slowdown.sql`](./supabase/migrations/0027_match_cron_pre_slowdown.sql)
4. **Dashboard → Database → Publications**：进 `supabase_realtime`，把里面每张表 toggle 一下（关-开）。不做这一步 Realtime 不会重载，订阅成功但永远收不到 broadcast（CLAUDE.md 里记的坑）
5. **重 deploy edge function**：
   ```bash
   supabase functions deploy match --project-ref <NEW-REF>
   ```
6. **轮换 4 个 secret**（Keychain → CF Worker）：
   ```bash
   secret update supabase-dams-url           # 新项目 URL
   secret update supabase-dams-anon          # 新 anon key
   secret update supabase-dams-srv           # 新 service_role key
   secret update supabase-dams-db-password   # 新 DB password
   ./scripts/cf-secrets-push.sh              # 同步 runtime secrets 到 Worker
   ```
7. CF Dashboard → Workers & Pages → dams-meetup → Settings → **Build environment variables**：更新 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`，然后手动 trigger 一次 rebuild

### 重新导出最新 schema 快照

```bash
supabase db dump \
  --db-url "postgresql://postgres.eniydtuycfekkwirasto:$(secret get supabase-dams-db-password | python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip(), safe=""))')@aws-0-eu-west-1.pooler.supabase.com:5432/postgres" \
  --schema public \
  -f supabase/schema-snapshot.sql
```

第一次跑会拉一次 docker 镜像（Supabase CLI 在容器里跑匹配版本的 pg_dump），之后秒级。
