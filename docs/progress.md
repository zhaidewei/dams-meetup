# Progress Log

> 项目过程记录。新条目放最上方。
> 与 `CLAUDE.md` 的 "Recently shipped" 互补：
> - CLAUDE.md = 当前快照 + 任务清单
> - 这里 = 决策叙事 + why

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
