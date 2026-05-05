# Progress Log

> 项目过程记录。新条目放最上方。
> 与 `CLAUDE.md` 的 "Recently shipped" 互补：
> - CLAUDE.md = 当前快照 + 任务清单
> - 这里 = 决策叙事 + why

---

## 2026-05-06 · AI 撮合显式同意 (issue #34, PR #40)

公开发帖被聚合成 AI 画像 + 私下需求被发 DeepSeek，两路都没有显式同意。issue 例子明确「首次询问，同意一次后不再问，拒绝则下次再问」。

最小方案：`users.ai_consent_at` **一列覆盖两路** —— 委托 AI 找人 = 必然贡献画像才能被反向推荐，拆两个 toggle 徒增认知。Inline checkbox 嵌在 PostComposer 已经会展开的 AI box 里，不另开 dialog（避开 iPhone Chrome hydration 雷区）。同意 piggyback 在 post submit 上 —— 用户填 intent + 勾 checkbox + 发帖一气呵成。未勾 + 填了 intent 报错（不静默丢用户输入，避免「以为发了其实没发」）。后端两路都 gate：`createPostAction` 写 intent 前 double-check，edge function `fetchProfiles` inner join 过滤未同意者。

---

## 2026-05-06 · 公共讨论区 lounge (issue #32, PR #38)

之前所有帖子必须挂在某会议板块（p1 / p2 / breakout / panel），活动开始前和空档期没有承载。新增 `lounge`：无时间窗、永远开放、UI 排第一位、活动外/空档默认进入。Migration 0018 放宽 `posts.section` 和 `event_state.current_section` 的 CHECK 约束，admin 大屏旋钮自动多一个 lounge 选项。

---

## 2026-05-05 · CF 部署切到朋友账户 live.nl-dams.com (PR #31)

为了用 zone `nl-dams.com`，从自己 CF 账户切到朋友账户。`wrangler.jsonc` pin `account_id` + custom_domain route。流程：本地首次 deploy → runtime secrets push 到 Workers → Workers Builds 接 `zhaidewei/dams-meetup` repo 自动 build & deploy。

朋友 CF 账户给的 role：`Workers Admin` + `Administrator Read Only`。后者补的是 Account Settings Read 权限 —— 没有它 Workers Builds 在 connect repo 时报权限错（这个错误信息很模糊，排查耗时）。Build env vars (NEXT_PUBLIC_*) 得在朋友 dashboard 单独配，**不走** `scripts/deploy.sh` 的 Keychain 注入路径（Builds 跑在 CF 端无 Keychain 访问）。

---

## 2026-04-30 → 2026-05-05 · /screen 主办方控制台 + 多板块 (issue #18 / #19 / #27 / #29 / #37)

`/screen` 从「自动滚动 timeline」演化为「主办方控制中枢」。关键决策：

- **admin console (issue #19)** 用一个 admin cookie 守门（密码门级，简单粗暴）。主办方在大屏侧边栏切 LIVE 板块、切 `screen_mode`（`default` / `qa` / `lottery`）、控 QA host、抽奖。
- **状态机**：板块时间窗（自动）+ admin override（手动）+ screen_mode 切换。`event_state` 单行表（id=1）做 state container，简洁过头但够用。
- **screen_mode = 'qa'** (issue #29 + migration 0015 / 0017)：QA 入口 banner + 题目按 like 排序滚动，admin 标已答 → 从 rotation 移除，`/feed` 改进折叠态归档；issue #37（PR #39，独立 worktree）修了某板块下 QA 入口没出现的 bug。
- **screen_mode = 'lottery'** (migration 0016)：admin 配规则 → 抽 → 大屏全屏揭晓。
- **issue #27 /screen 大改版**：焦点帖 + 网格 layout，max-width 1400px 防焦点散开。
- **issue #18 系列**铺底 UX：Header 红点合并未读、板块上下文条、/me 重排、onboarding 提示、PostComposer 折叠减负（首屏只有 textarea + 发帖按钮，AI 撮合 / 编辑身份都折叠）。

---

## 2026-04-29 → 2026-05-04 · UI 整改两轮 + UserCard popover

第一轮：Lu.ma-lite 风（indigo + lucide + EventHero）。第二轮（PR #33）：indigo → blue + 修 DM 气泡内文居中。

更重要的交互决策：**联系方式从帖子搬到人**（commits 9f379d0 / f0c40a4 / 5e701dc）—— 之前每条帖子都带「显示联系方式」toggle，导致信息冗余、隐私心智模型混乱（用户搞不清「我这条帖子勾了 vs 我整体公开了」）。改成**点头像出 UserCard popover**，里面有姓名 / 公司 / 联系方式（如果对方公开）+ 复制 / DM 按钮。AI 撮合推荐对象也走同一个 popover (issue #24)。

同时删了 `/me`「有人想找你」面板（063185a）—— 已被「点头像看谁找过你」覆盖，留着是冗余路径。

---

## 2026-05-03 · DM (PR #14) + 后续删 reveal

加 1:1 DM 页 (issue #14)：`dm_threads` + `dm_messages` 两表（migration 0012），partner uid 用 `user_low / user_high` 排序避免重复 thread。后来 UserCard popover 上线后，发现「在 DM 里 reveal 联系方式」按钮和 popover 的展示路径重叠 → 删掉 reveal 入口，统一走 popover。同时支持「整段对话 hard delete」（任一方都可，e38eed1）。

---

## 2026-05-03 · Realtime 接线 + iPhone Chrome 雷区 (issue #7)

`/feed` 双标签自动同步通过：`FeedRealtime` 客户端订阅 posts/replies/likes/poll_votes，500ms debounce 后 `router.refresh()`。`ScreenView` 改成 Realtime 触发 + 60s 兜底 interval。

途中两个隐形坑（已写进 CLAUDE.md Known quirks）：

1. **PG 15 列白名单 publication 在 Supabase Realtime 里被静默丢弃**：`add table foo (col1, col2)` 语法 pg 层正确但订阅永远收不到 broadcast。结论：要隐藏字段就把字段搬到独立表。`match_intent` 因此从 `posts` 整列搬到 `post_match_intents`（migration 0011），物理隔离不进 publication。
2. **`ALTER PUBLICATION` 后必须 Dashboard toggle**：纯 SQL 改 publication 不会让 Realtime 重新加载内部状态，旧状态一直 cache，订阅永远收不到。改完必须去 Dashboard → Database → Publications → toggle 表（关再开）。

iPhone Chrome / iOS hydration 双坑（d6f2a60）：Chrome iOS 自动注入 `__gcrremoteframetoken` / `__gcruniqueid` → React 19 root-level hydration mismatch → abort 整 tree → onClick / useState / useOptimistic 全失效。修复：`<html suppressHydrationWarning>` + 所有写操作走 React 19 form action（progressive enhancement 是天然兜底）。**生产仍依赖 form action 写法，不能 revert**。LAN dev 还要 `next.config.ts` 加 `allowedDevOrigins`（改完必须重启 dev server）。

---

## 2026-04-26 → 2026-05-03 · AI 撮合 slice 2 + slice 3 上线

slice 2（92e7146）：mock SQL insert 几条 AI reply 验 UI 链路 —— `ReplySection` 的 `AiReplyRow` + /me 通知都通了。

slice 3（f1bc1ca + 2026-05-03 傍晚部署）：Supabase Edge Function `match` + DeepSeek call + pg_cron 每 5min 触发 + `match_runs` 日志表（migration 0008 / 0009）。`fetchCandidates` 拉未处理的 `post_match_intents`，`fetchProfiles` 聚合最近 500 条 posts 成画像，`buildPrompt` 拼装文本 prompt，DeepSeek 返回 `[post_id, user_id, reason]` 数组，写回 `replies` 表（`is_ai=true`, `visibility='author_only'`）。`MIN_INTENT_THRESHOLD=3` cron 跳过避空跑；admin URL `?force=<ADMIN_TOKEN>` 跳阈值。

issue #17 的 hardening：`prompt.ts` 加 `redactContacts()`（邮箱 / URL / ≥10 数字串 → `[已隐藏]`），UI 加 DeepSeek 数据流向声明。`closePollAction` 把 `poll_deadline` 提前到 `now()` 复用既有字段，不引入新状态列。

issue #15：联系方式胶囊化 + 一键复制按钮（58de5fc）。

---

## 2026-04-25 · F'' 撮合 slice 1（schema + 前端管道）

按 `matching-design.md` §6 checklist 推进 F''。本 slice 不接 LLM — 只把 schema 和 UI 管道铺好，AI reply 槽位渲染但暂时为空。

**slice 1 范围（已完成）**
- `supabase/migrations/0004_match_intent.sql`
  - `posts.match_intent text` — 私下暗字段
  - `replies.is_ai/visibility/mentioned_user_id` + check constraint（人类作者 OR AI）
  - DROP TABLE matches
  - 收紧 anon RLS：只读 `visibility='public'` replies
  - 索引：mentioned_user_id partial、(post_id, is_ai)
- `PostComposer` 折叠区域"委托 AI 寻找匹配（私下，仅你可见）" + 200 字 textarea
- `createPostAction` 接收 match_intent 写入 posts
- `fetchFeed` 选 match_intent + replies 全字段；**在 viewer 层过滤 author_only**（核心隐私 enforcement）
- `ReplySection` 新增 `AiReplyRow`（🤖 + 淡蓝 + 推荐对象姓名）
- `fetchMentionsOfMe` 新查询；`/me` 新 section "有人想找你"
  - 只暴露关联帖子摘要 + 时间，不暴露 reply.body 或对方 match_intent
- `fetchRepliesToMe` 现过滤 is_ai=false（AI 回复走撮合通知，不混入"收到的回复"）
- 删 `/matches` 路由 + Header tab + `MatchRow` 类型

**质量 gate**
- typecheck ✅ · lint ✅ · 9/9 tests ✅
- 注：smoke test 跑的是 0004 应用前的 schema，没暴露 column 不存在问题

**下一步切片**
- **slice 2**：人工 SQL insert 几条 mock AI reply 验 UI 渲染 + /me 通知
- **slice 3**：Supabase Edge Function + DeepSeek + pg_cron + prompt engineering

**重要 handover 信息**
- live Supabase DB **尚未应用 0004**。在应用前跑 `npm run dev` 会让 `/feed` 和 `/me` 的查询出 column 错误
- 应用顺序：直接跑 `0004_match_intent.sql` 全文（含 DROP matches；当前 matches 表为空）
- 应用后无需重启 dev server（运行时查询）

---

## 2026-04-25 · 基础夯实（文档 + 测试）

撮合开工前的基础工作。范围严格控制（最小集），不堆 ROI 低的产物。

**Docs（3 篇）**
- `architecture.md` — 身份系统 sequence diagram（密码门 / 恢复链接 / VIP 登录三路径）+ 模块职责索引
- `schema.md` — 表关系 ERD + 字段 / RLS / Realtime publication 人类可读版
- `dev-setup.md` — secret CLI + Keychain 流程 + Turbopack workspace 坑等

**Tests（vitest）**
- 装 vitest 4.1，配 `tsconfig path alias` + `server-only` stub
- `src/lib/constants.test.ts` — `cookieExpiresAt` 7 天偏移 + DB 约束镜像（POST_MAX_CHARS=300 等）
- `tests/supabase-smoke.test.ts` — service-role key 连通性，env 缺失自动 `it.skipIf` 跳过
- `scripts/test.sh` 复用 dev.sh 的 Keychain 注入模式
- 9/9 通过（7 unit + 2 smoke 真连 Supabase）

**故意不做**
- E2E (playwright) — 单场活动 ROI 低
- 每个 server action 集成测试 — 需要测试 DB
- 组件测试 — UI 还在变

下一步：F'' 撮合实现，按 `matching-design.md` §6 checklist。

---

## 2026-04-25 · AI 撮合方案定稿（F''）

**背景**：CLAUDE.md task queue #1，要给 5/9 活动加"撮合"功能。schema 0001 里已有 `matches (user_id, matched_post_id, score, reason)` 但行为未定义。

**探索过程**：从 6 个候选方案逐步收敛 — 详见 `docs/matching-design.md`。

| 方案 | 关键特征 | 结果 |
|---|---|---|
| A | tag overlap，纯规则 | 备选 |
| B | embedding 相似 | 备选 |
| C | LLM 标注 need/offer + 规则配对 | 一度推荐 |
| D | 纯 LLM 配对 | 备选 |
| E | 用户主动搜索（不做 AI） | fallback |
| F → F' → F'' | 显式撮合，逐步演化 | **✅ 终选** |

**关键决策点**

1. **撮合粒度**：从 schema 默认的 user→post 改成 user→user。理由：meetup 的核心动作是"找对人聊"，推荐帖子绕了一层。

2. **撮合语义**：选择**互补**而非相似。理由：两个都在求 Meta 内推的人配在一起没意义；用户要的是"能帮我的人"。

3. **F''（终版）的核心洞察**（来自用户）：
   - 如果用户愿意写一段意图给系统，他大概率也愿意发到 feed —— 那让用户写第二遍就是 Occam 警告
   - 撮合的差异化价值不在"也是用户输入"，而在 **"系统替用户做组合优化"** + **"用户能表达不能广播的需求"**（隐私维度）
   - 解法：composer 多一个折叠的"委托 AI 寻找"私下字段（不入 feed），LLM 以 reply 形式内联回应

4. **AI 回复的可见性**（双向通知模式）：
   - 发帖人 A：在自己帖子下看到 AI reply（含完整理由）
   - 被推荐人 B：在 `/me` 看到"有人想找你聊 [某帖]"，但**不暴露**对方暗需求
   - 这平衡了隐私与撮合闭环

5. **`/matches` tab 废除**：所有交互内联到 feed + /me，避免用户错过。

**意外简化**

- 原 schema 的 `matches` 表彻底不需要 — 撮合结果就是 replies 的特殊类型
- Schema 改动只剩：`posts` 加 `match_intent`、`replies` 加 `is_ai/visibility/mentioned_user_id`
- 成本从 C 方案的 ¥8-12/场 降到 ~¥1/场

**下一步**

不立即开撮合实现。先做基础夯实：
- 当前功能补充文档
- 关键模块加测试（identity、server actions）

撮合实现的 checklist 已在 `docs/matching-design.md` §6 备好。

---

## 2026-04-25 · MVP 主线推进（前序）

详见 `CLAUDE.md` "Recently shipped" 段落。本日内累计完成：
- Scaffold + Supabase schema + 密码门 + 身份系统
- Feed (composer / postcard / like / reply)
- /me tab + recovery
- VIP login + polls
- /screen 投影模式

(详细决策记录从此条目起开始记录；之前内容查 git log + CLAUDE.md)
