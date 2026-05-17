# 下一届启动手册

把当前的"再见页"部署翻回成「下一届 live 活动」的网站，10 个动作。

> 当前状态（2026-05-17 写）：所有 UI 路由都 308 到 `/summary`；数据库等待
> `scripts/reset-event-data.sql` 清空。本文是把它重新激活的步骤。

---

## 0. 心智模型

这个仓库是 **single-event scope**：一个 git 分支 = 一届活动。下一届：
- 不开新仓库；在 `main` 上开 `next-event-15` 分支干活。
- 数据库是同一个 Supabase 项目，复用 schema，**只重置数据**。
- 域名 `live.nl-dams.com` 不变；CF Worker 同一个。

如果哪一届想换域名 / 换 Supabase 项目，把 §6 secrets 那一节整段重做即可。

---

## 1. 总流程（按顺序做）

```
A. 拉分支               git checkout -b next-event-15
B. 改 event 元数据      §2  （env + constants + agenda）
C. 重置 DB              §3  （跑 reset SQL + 发新 VIP token + 新密码）
D. 拆 byebye redirect   §4  （改 next.config.ts）
E. 改主题/嘉宾页面      §5  （/ppt、PostComposer 文案、Agenda 组件）
F. 校对 secrets         §6  （CF dashboard build env + wrangler secret）
G. dev 自测             §7
H. merge → 自动部署     §8  （CF Workers Builds 接 main）
I. 活动当天             §9  （admin 控制台、撮合 cron 节奏）
J. 活动结束             §10 （生成 summary、再次进入再见态）
```

---

## 2. 改 event 元数据

**必改文件：**

| 文件 | 改什么 |
|---|---|
| `scripts/deploy.sh` | `NEXT_PUBLIC_EVENT_NAME` / `START` / `END`（仅本地手动 deploy 用） |
| `scripts/seed.sh` | 同上（loadtest 用） |
| `.env.local`（本地） | `EVENT_PASSWORD`、`NEXT_PUBLIC_EVENT_*` |
| `.env.local.example` | 把示例值改成下一届的，方便协作者参考 |
| `src/lib/constants.ts` | 兜底值（`?? '...'`）——和 env 保持一致即可 |
| `src/lib/agenda.ts` | 全量重写 `AGENDA[]`、`SPONSORS[]`、`PANELISTS[]` |
| `src/lib/sections.ts` | 如果换演讲数量 / 板块结构，改 `SECTIONS` 和 `SECTION_WINDOWS` |

**Cloudflare 端必改**（build 时注入到 client bundle）：

CF Dashboard → Workers & Pages → `dams-meetup` → Settings → **Build environment variables**：
- `NEXT_PUBLIC_SUPABASE_URL`（一般不变）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`（一般不变）
- `NEXT_PUBLIC_EVENT_NAME` ← 改
- `NEXT_PUBLIC_EVENT_START` ← 改（ISO with `+02:00` for CEST 或 `+01:00` for CET，**注意尾部不能有空格**，CLAUDE.md 老问题）
- `NEXT_PUBLIC_EVENT_END` ← 改
- `NEXT_PUBLIC_EVENT_ORGANIZER`（一般不变）

⚠️ build env 改完必须在 CF dashboard 手动 trigger 一次 rebuild，旧 bundle 才会被替换。

---

## 3. 重置数据库

```bash
# 0) 先确认本届 summary 已经导出归档：
#    docs/summary-2026-05-09/  → result.json + index.html + *.pdf
#    没归档不要往下走，数据没了再问就晚了。

# 1) 跑 reset
PGPASSWORD="$(secret get supabase-dams-db-password)" \
psql "host=db.<project>.supabase.co user=postgres dbname=postgres sslmode=require" \
  -f scripts/reset-event-data.sql

# 或者 Supabase SQL Editor 粘贴 scripts/reset-event-data.sql 执行。

# 2) 重新签发 VIP token（每位嘉宾一行）
#    SQL Editor 执行：
#      insert into vip_tokens (token, vip_name, vip_title) values
#        ('vip-15-xxxx', '张某', 'CTO @ XX'),
#        ('vip-15-yyyy', '李某', 'PhD @ TU Delft');
#    然后把 https://live.nl-dams.com/?vip=vip-15-xxxx 发给本人。

# 3) 设置新活动密码
secret update dams-event-password   # 交互式输入新密码
./scripts/cf-secrets-push.sh        # 把 Keychain 同步到 Worker runtime
```

校验：reset 脚本最后会 `raise notice 'reset done: users=0 posts=0 ...'`，
看到这行才算成功。

---

## 4. 拆 byebye redirect

`next.config.ts` 里 `async redirects()` 整块 **删掉或注释掉**。
保留 `turbopack` 和 `allowedDevOrigins`。

```ts
// 删这块 ↓
async redirects() { return [ ... ] },
```

不删的话，无论怎么改前端，所有页面都还是 308 → `/summary`。

---

## 5. 改主题 / 嘉宾 / 文案

| 文件 | 改什么 |
|---|---|
| `src/app/ppt/page.tsx` | 全量重写：欢迎页、议程、嘉宾介绍、入场说明、密码 |
| `src/components/Agenda.tsx` | 一般不改（数据来自 `agenda.ts`），除非样式调整 |
| `src/components/EventHero.tsx` | 标题副标题 |
| `src/components/PostComposer.tsx` | tag 候选词、占位文案，如果换主题方向 |
| `src/components/OnboardingBanner.tsx` | 第一次进入的引导文案 |
| `public/speaker-*.png` | 替换嘉宾头像 / 二维码 |

搜一遍硬编码字段：

```bash
grep -rn "14期\|刘爵铭\|杨杰\|McCain\|Delft" src/ public/ docs/ | grep -v summary-2026-05-09
```

---

## 6. Secrets 检查

| 名字 | 在哪 | 改不改 |
|---|---|---|
| `dams-event-password` | Keychain (`secret`) → Worker (`wrangler secret put EVENT_PASSWORD`) | **每届必改** |
| `supabase-dams-url` / `-anon` / `-srv` | Keychain | 一般不改 |
| `supabase-dams-db-password` | Keychain | 一般不改 |
| `deepseek-dams-key` | Keychain → Worker | 一般不改，过期就转 |

Worker runtime secret 改了之后必须跑 `./scripts/cf-secrets-push.sh`，
不会自动同步。

---

## 7. dev 自测 checklist

```bash
npm run dev     # ./scripts/dev.sh 注入 secrets 后跑
```

- [ ] 打开 `http://localhost:3000/` 应该看到密码输入框（不再 redirect 到 /summary）
- [ ] 输入新密码 → 跳 `/feed`，板块 tabs / agenda / 头像都正常
- [ ] `/vip-login` 用一个新 VIP token 登入 → 个人信息显示新嘉宾名 + title
- [ ] `/admin` 控制台显示新议程
- [ ] `/screen` 投屏页时钟显示新活动日期；非活动期看到完整议程
- [ ] `/ppt` 显示新欢迎页
- [ ] **触发一次发帖 + 点赞 + 回复**，没有 500

---

## 8. 上线

```bash
git add -A && git commit -m "feat: bootstrap meetup #15"
git push origin next-event-15
gh pr create --title "Bootstrap meetup #15"
# 走自己平时的 review 流程；merge 后 CF Workers Builds 自动 build + deploy
```

如果 CF 自动 build 没触发或挂了，本地兜底：

```bash
./scripts/cf-secrets-push.sh   # 一次性
./scripts/deploy.sh            # 兜底手动 deploy
```

---

## 9. 活动当天

- AI 撮合 cron 已经按阶段自动切频率（`pre/live/post/cleanup`，见
  `src/lib/constants.ts:getEventPhase()` + `supabase/migrations/0025_match_cron_phased.sql`）。
  下一届的 `EVENT_START` / `EVENT_END` 改完，cron 行为会自动按新窗口走。
- 投屏走 `/screen`，admin 控制台 `/admin`。两者都需要 admin cookie——
  本地 `/admin` 第一次进会引导设置（细节看 `src/lib/identity.ts` 里 `setAdminCookie`）。
- 监控：CF dashboard → Workers → dams-meetup → Logs，或 Supabase Dashboard → Logs。

---

## 10. 活动结束后

进入再见态：

1. 跑 summary SQL：以 `docs/summary-2026-05-09/summary.sql` 为模板复制一份成
   `docs/summary-YYYY-MM-DD/summary.sql`，把 event window 时间换成本届的。
   去 Supabase SQL Editor 跑，导出每行的 jsonb 拼成 `result.json`。
2. 把 `result.json` 的内容贴回 `docs/summary-YYYY-MM-DD/index-light.html` 里的 `const D = ...`
   （也可以脚本化，看你愿意）；改顶部「再见 hero」slide 里的口号；改 `cover` slide 里的日期/地点。
3. 改 `scripts/gen-summary-html.mjs` 第 12 行 `SRC` 路径指向新目录。
4. 跑 `node scripts/gen-summary-html.mjs` 重新 bake `src/app/summary/summary-html.ts`。
5. 把 `next.config.ts` 里的 `async redirects()` 复制回来（参考 git history 里
   `8ed8147` 之后的版本）；如果新增了路由，对应加进 redirect source 列表。
6. 跑 `scripts/reset-event-data.sql` 清数据（确保 summary 已经归档！）。
7. commit + push + merge → 再次进入再见态，等下下届。

---

## 附录：当前再见态相关文件清单

| 文件 | 作用 |
|---|---|
| `next.config.ts` `async redirects()` | 所有 UI 路由 → `/summary` |
| `src/app/summary/route.ts` | 服务 `/summary` 路径 |
| `src/app/summary/summary-html.ts` | bake 出来的静态 HTML（不要手改） |
| `docs/summary-2026-05-09/index-light.html` | summary 的源文件，改它然后重 bake |
| `docs/summary-2026-05-09/summary.sql` | 跑出数据的查询模板 |
| `docs/summary-2026-05-09/result.json` | 本届数据快照 |
| `docs/summary-2026-05-09/*.pdf` | 离线分享版本 |
| `scripts/reset-event-data.sql` | 清空业务数据（保留 schema） |
| `scripts/gen-summary-html.mjs` | 把 index-light.html bake 成 TS export |

---

## 别忘了

- 大屏密码（admin token / event password）不要写进 commit、不要发群、不要进 CLAUDE.md。
- 改 `NEXT_PUBLIC_EVENT_*` 千万注意 ISO 字符串末尾不能有空格，CF Worker build 会把整个 env 值当字面量塞进 bundle，后果是前端 `Date.parse` 拿到 `NaN`，banner / 倒计时全错。
- `ALTER PUBLICATION` 改完必须去 Supabase Dashboard → Database → Publications 手 toggle 一下 `supabase_realtime`，不然 Realtime 不会重载（PR #7 教训）。
