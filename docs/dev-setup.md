# 本地开发环境

> 适用：macOS + zsh + Node 20+。其它平台需自行替换 Keychain 部分。

---

## 1. 一次性准备

### 1.1 装依赖

```bash
cd ~/dams-meetup
npm install
```

### 1.2 凭据放进 macOS Keychain

不写 `.env.local`、不 commit 凭据。所有 secret 通过 `~/.local/bin/secret` 命令存到 Keychain。

需要的条目（运行 `secret list` 查看）：

| 名称 | 来源 |
|---|---|
| `dams-event-password` | 主办方设定的活动密码 |
| `supabase-dams-url` | Supabase project URL |
| `supabase-dams-anon` | Supabase `anon public` key |
| `supabase-dams-srv` | Supabase `service_role` key |
| `supabase-dams-public-key` | Supabase 新版 publishable key（暂未用） |
| `supabase-dams-db-password` | Supabase DB 密码（仅 SQL Editor 用） |
| `deepseek-dams-key` | DeepSeek API key（撮合用，未接） |

新增条目：
```bash
secret add <name> "<描述>"
# 交互式隐藏输入
```

### 1.3 应用 SQL migrations 到 Supabase

migrations 在 `supabase/migrations/` 下：
- `0001_schema.sql` — 主表
- `0002_realtime.sql` — Realtime publication
- `0003_vip_login.sql` — VIP 登录改造

**目前是手动应用**：去 Supabase 控制台 → SQL Editor，按顺序粘贴执行。

CLAUDE.md 已记录三份都已应用到生产 DB。

---

## 2. 日常启动

```bash
cd ~/dams-meetup
npm run dev   # 等价于 ./scripts/dev.sh
```

`scripts/dev.sh` 做的事：
1. 检查 `secret` CLI 存在
2. 从 Keychain 读出所有 secret，export 成环境变量
3. export 非 secret 的 `NEXT_PUBLIC_EVENT_*`
4. `exec npx next dev "$@"`

启动后访问 `http://localhost:3000`，输密码进 `/feed`。

---

## 3. 检查类命令

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
```

---

## 4. 常见坑

### 4.1 Turbopack 检测到外部 workspace

如果 dev 报 monorepo 相关错（找不到 next、workspace 冲突），原因是 home 目录有顶层 `package.json` / `node_modules` / `package-lock.json`。

**已知 workaround**（CLAUDE.md "Known quirks" 节）：
```bash
mkdir -p ~/.home-pkg-backup
mv ~/package.json ~/package-lock.json ~/node_modules ~/.home-pkg-backup/
```

dev 稳定后再考虑还原。

### 4.2 改 env 后行为没变

清掉 `.next` 缓存：
```bash
rm -rf .next
npm run dev
```

### 4.3 cookie 域名不对

`.env.local` 模式跑 dev 时，cookie 默认 `secure=false`（因为 NODE_ENV=development）。如果用 ngrok / 域名代理，注意 secure 设置。

### 4.4 看不到自己的帖子

发完帖在 `/feed` 没看到？
- F12 → Cookies → 检查 `dams-uid`
- Supabase 控制台查 `posts` 表，是否新插入的 user_id 跟 cookie 一致
- 多半是 ensureUser 没生效，看 server logs

---

## 5. 常用 SQL 调试片段

去 Supabase SQL Editor 跑：

```sql
-- 全场用户数 + 在线（5min 内有动作）
select count(*) total,
       count(*) filter (where last_seen_at > now() - interval '5 min') online
from users;

-- 最近 10 条帖子
select id, type, body, created_at, user_id from posts
order by created_at desc limit 10;

-- 我的帖子（替换 UID）
select * from posts where user_id = '<uid>' order by created_at desc;

-- VIP 列表
select username, vip_name, vip_title, user_id from vip_tokens;

-- 重置某个 VIP 绑定（测试用）
update vip_tokens set user_id = null, used_at = null where username = 'xxx';
```

---

## 6. 测试

```bash
npm test           # 跑 vitest
npm run test:watch # 监听模式
```

详见 `docs/testing.md`（如果之后扩展）；当前测试范围见 `vitest.config.ts` + `*.test.ts` 文件。
