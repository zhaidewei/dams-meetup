# dams-meetup

荷兰华人数据社群 Meetup 现场互动站。第 15 期使用 Next.js、Cloudflare Workers、D1 和 Durable Objects。

```bash
npm ci
npm run dev
npm test
```

本机开发和生产 D1 迁移见 [第 15 期开发与发布](./docs/dev-setup.md)。第 14 期的启动和重置步骤见 [上线手册归档](./docs/next-event-bootstrap.md)，历史结果见 [第 14 期活动复盘](./docs/summary-2026-05-09/)。

## 构建依赖约束

`package.json` 对 `@node-minify/core` 的 `glob` 使用同主版本 `^10.5.0` 覆盖，修复 OpenNext 构建链旧版 `glob` CLI 的命令注入公告。更新或移除覆盖前，应重新检查锁文件及 `npm audit --omit=dev`。

## 第 14 期 Supabase 数据库归档

以下命令仅用于恢复第 14 期的历史环境。第 15 期的本机和生产操作统一使用上面的开发与发布手册。

### 历史隐私修复迁移

`0028_private_contacts_and_poll_results.sql` 在公开视图中隐藏未公开的联系方式，并将浏览器角色对该视图的权限限定为只读，防止改写隐私开关；撤销原始选票访问，将选票 Realtime 广播替换为公开帖子的刷新时间。服务端同时在返回 feed／私信资料前脱敏，投票计数仅在已投票、已截止或结果公开时返回；投影页在不可见时显示截止后公布结果，不显示虚假零票。

恢复第 14 期应用时，先在历史数据库应用该迁移，再发布第 14 期应用。旧客户端需刷新以切换到帖子通知。迁移本身不修改用户保存的联系方式或选票。历史 `schema-snapshot.sql` 保留原件，恢复快照后必须再应用 `0028`，不可把旧快照当作已修复版本。

### Reset（保留 schema，清空数据）

活动落幕后清空业务数据，schema 不动。**不可逆**，跑前确认 summary 已经归档。

去 Supabase Dashboard → SQL Editor，粘贴 [`scripts/reset-event-data.sql`](./scripts/reset-event-data.sql) 跑。
末尾看到 `NOTICE: reset done: users=0 posts=0 event_state_clean=t` 即成功。

### 从快照恢复 / 在新项目里重建 schema

[`supabase/schema-snapshot.sql`](./supabase/schema-snapshot.sql) 是修复前 `public` schema 的历史 pg_dump，保留原件，不含 `0028` 的隐私修复。它由 `supabase` CLI 导出（本机 `pg_dump` 15 与 Supabase PG 17 版本不匹配）；恢复后须应用后续迁移。

#### 场景 A：往**同一个 Supabase 项目**恢复（drop 干净之后）

```sql
-- Dashboard → SQL Editor
drop schema public cascade;
create schema public;
-- 然后粘贴 supabase/schema-snapshot.sql 全部内容
-- 最后应用 supabase/migrations/0028_private_contacts_and_poll_results.sql
```

#### 场景 B：迁到**新的 Supabase 项目**（如老项目已删）

1. 新建 Supabase 项目，记下 project ref 和 db password
2. 恢复 schema：
   ```bash
   supabase db push --db-url "postgresql://postgres.<NEW-REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres" \
     --file supabase/schema-snapshot.sql
   ```
   或者 Dashboard → SQL Editor 粘贴 `schema-snapshot.sql` 跑。随后应用 [`0028_private_contacts_and_poll_results.sql`](./supabase/migrations/0028_private_contacts_and_poll_results.sql)。
3. **重建 pg_cron 调度**（snapshot 不含 `cron.job` 行）：
   按顺序在 SQL Editor 跑 [`supabase/migrations/0009_match_cron.sql`](./supabase/migrations/0009_match_cron.sql)
   → [`0025_match_cron_phased.sql`](./supabase/migrations/0025_match_cron_phased.sql)
   → [`0027_match_cron_pre_slowdown.sql`](./supabase/migrations/0027_match_cron_pre_slowdown.sql)
4. **Dashboard → Database → Publications**：如需重载 `supabase_realtime`，仅切换已经公开的表；保持 `poll_votes` 关闭，选票变化由 `posts.poll_updated_at` 通知。不要重新开启私密选票广播。
5. **重 deploy edge function**：
   ```bash
   supabase functions deploy match --project-ref <NEW-REF>
   ```
6. 历史数据库凭据通过本机 `secret` 管理。第 15 期 Worker 的配置见[开发与发布](./docs/dev-setup.md#生产发布)。

### 重新导出最新 schema 快照

```bash
supabase db dump \
  --db-url "postgresql://postgres.eniydtuycfekkwirasto:$(secret get supabase-dams-db-password | python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip(), safe=""))')@aws-0-eu-west-1.pooler.supabase.com:5432/postgres" \
  --schema public \
  -f supabase/schema-snapshot.sql
```

第一次跑会拉一次 docker 镜像（Supabase CLI 在容器里跑匹配版本的 pg_dump），之后秒级。
