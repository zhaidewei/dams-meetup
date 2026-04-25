# Progress Log

> 项目过程记录。新条目放最上方。
> 与 `CLAUDE.md` 的 "Recently shipped" 互补：
> - CLAUDE.md = 当前快照 + 任务清单
> - 这里 = 决策叙事 + why

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
