# AI 撮合服务设计 — 候选方案

> 状态：设计中 · 待决策
> 目的：在 5/9 当天给 200 个参会者提供"应该跟谁聊"的推荐
> Owner：zdw

---

## 1. 目标与约束

### 原始价值
活动 4 小时，200 人坐成几十桌。`/feed` 解决了"想法广播"，但**找到对的人坐下聊**还是靠运气。AI 撮合就是要替用户在 200 人里筛出值得花 10 分钟说话的 3-5 人。

### 硬约束
- **失败优雅** — DeepSeek 挂了，`/matches` 显示空态，活动其它部分不受影响
- **成本可控** — 单场预算 ≤ ¥50
- **冷启动友好** — 没发过帖子的用户也得有合理体验
- **无 PII 泄漏** — 撮合 prompt 里不带用户邮箱/电话

### 已固定的 schema
```sql
matches (user_id, matched_post_id, score, reason, computed_at)
```
后面会讨论这个 schema 是否要改成 `(user_a, user_b, ...)`。

---

## 2. 三个设计维度

任何方案都要在这三个维度上各做一次选择：

| 维度 | 选项 |
|---|---|
| **粒度** | user→user / user→post / user→tag |
| **语义** | 相似（同行交换） / 互补（求供对齐） / 混合 |
| **算法** | 纯规则 / Embedding / LLM 标注+规则 / 纯 LLM |

下面 5 个方案是这个空间里的具体点。

---

## 3. 候选方案

### 方案 A：Tag overlap（纯规则）

**一句话**：把每个用户发过的帖子 tags 取并集作画像，用 Jaccard 相似度找 top K。

**算法**
```
user_tags(u) = ⋃ post.tags for post in u.posts
score(A, B) = |A.tags ∩ B.tags| / |A.tags ∪ B.tags|
```

**用户看到的 reason**：
> 你们都关注 `#ML` `#内推`

**成本**：0（无外部 API）

**优势**
- 零依赖、零成本、活动当天最稳
- 完全可解释
- 实现 1 天

**劣势**
- 只找相似，不找互补 → 两个都在求 Meta 内推的人会被强配对
- tags 是自由文本，"ML" / "ml" / "机器学习" 不归一，画像稀疏
- 没发帖的用户彻底失踪

**适合**：MVP fallback、cold start 兜底

---

### 方案 B：Embedding 相似度

**一句话**：把每个用户的所有帖子 + 自我介绍拼成画像文本，embed 之后 cosine similarity 找 top K。

**算法**
```
profile(u) = concat(u.posts.content) + u.nickname + u.company + u.title
vec(u)     = embed(profile(u))
score(A,B) = cos(vec(A), vec(B))
```
增量：只对有新帖子的用户重算向量。

**用户看到的 reason**：
> 推荐你和 张三 聊聊 — 你们都在做 ML infra，他在 Booking 用 Spark/Airflow，跟你最近发的栈相似。
（reason 由 LLM 根据双方画像生成）

**成本估算**
- Embedding：200 用户 × ~500 token = 100k token
- ⚠️ DeepSeek **没有 embedding API**，要走 OpenAI / Cohere / 本地开源（bge-m3）
- Reason 生成：200 × 5 推荐 = 1000 次 LLM call ≈ ¥5
- 总计：**¥5-15**（取决于 embedding 来源）

**优势**
- 语义比 tag 强很多，自由文本归一不再是问题
- 增量便宜
- 实现中等（2 天）

**劣势**
- 仍然是**相似**，不是互补 — 这是核心问题
- 多一个外部依赖（embedding 服务）

**适合**：把 meetup 当"找同行"场景

---

### 方案 C：Need-Offer 互补 + 规则配对（推荐）

**一句话**：LLM 把每条帖子标成 need/offer/opinion，规则做 need↔offer 双向匹配，再用 LLM 写 reason。

**算法（三层 pipeline）**

**Layer 1 — 帖子分类（LLM，每条一次，缓存）**
```json
input:  "求 ML infra 岗位内推，欧洲 base"
output: {
  "kind": "need",
  "domain": ["ML", "infra", "Europe"],
  "specifics": "求 ML infra 内推"
}
```

**Layer 2 — 规则配对（无 LLM）**
```
score(A, B) =
    Σ overlap(A.needs.domain, B.offers.domain)
  + Σ overlap(A.offers.domain, B.needs.domain)
  + bonus_if 双向匹配
```
O(n²) = 40k 配对，毫秒级。

**Layer 3 — Reason 生成（仅 top K 调 LLM）**
喂入双方画像 + 匹配的 need/offer 对，让 LLM 写一句话理由。

**用户看到的 reason**：
> 推荐你和 李四 聊聊 — 你发过"求 ML infra 内推"，他在 Booking ML infra 团队，发过"我们组在招"。

**成本估算**
- Layer 1：~600 帖子 × 1 LLM call ≈ ¥3（增量后续几乎为 0）
- Layer 3：200 用户 × 5 推荐 = 1000 次 ≈ ¥5
- 总计：**¥8-12**

**优势**
- 直接对应原始价值（互补）
- 三层都可独立 debug、调权重
- Reason 自然来自匹配逻辑，可解释

**劣势**
- 实现最复杂（3-4 天）
- Layer 1 分类准确性影响下游 — 需要 prompt 调一轮
- opinion 类帖子参与不了撮合（要不要吸收成弱信号待定）

**适合**：当作主方案

---

### 方案 D：纯 LLM 一把梭

**一句话**：把所有 200 用户画像塞进一个超长 prompt，让 LLM 对每个用户直接输出"应该聊的人 + 理由"。

**算法**
```
for each user u:
  prompt = "用户画像 u: ...
            候选 199 人画像摘要: ...
            输出 top 5 推荐 + 每条理由"
  result = deepseek(prompt)
```

**用户看到的 reason**：
> 推荐你和 王五 聊聊 — 你最近在转型 data engineering，他三年前从 DS 转 DE，发过经验贴，可以聊路径。

**成本估算**
- 200 次调用 × ~50k token 输入（其他 199 人画像摘要）
- DeepSeek-V3 输入 ¥1/1M token
- 总计：**¥10-30**

**优势**
- 最灵活：LLM 可同时权衡相似+互补+资历差
- 实现最简单（1 prompt + 1 cron，~2 天）
- Reason 跟匹配同时产出，逻辑一致

**劣势**
- 黑箱，无法 debug 为什么某两人没被配上
- 上下文窗口压力大，画像必须摘要
- 质量完全靠 prompt engineering，不稳定

**适合**：要语义又嫌方案 C 工程复杂，可作"快速试一版"

---

### 方案 E：不做 AI，改成"主动搜人"

**一句话**：`/matches` 改成 "我在找…" 的 form，用户填关键词，系统 grep 其他人的帖子。

**算法**
- 用户输入："会 dbt 的"
- Postgres `ILIKE '%dbt%'` 在 posts.content 里搜
- 返回发过相关帖子的用户列表

**用户看到的**：
搜索结果列表，点用户头像跳到他的帖子流。

**成本**：0

**优势**
- 完全没有 AI 依赖，5/9 当天最稳
- 用户对结果有完全控制
- 实现 0.5 天

**劣势**
- 不是"撮合服务"，是"搜索功能"
- 用户必须知道自己想找什么 — 等于把发现的负担推回用户
- 冷启动并不更好

**适合**：5/9 之前 AI 方案搞不定时的 graceful fallback；或作为方案 C/D 的并行补充功能

---

### 方案 F''：发帖时附加暗需求 + AI 内联回帖（✅ 终版，已决策）

**一句话**：PostComposer 加一个"委托 AI 寻找"折叠字段（私下，不入 feed）；LLM 以 system 身份在帖子 reply 区写匹配结果（仅发帖人可见）；被推荐的人在 `/me` 收到"有人想找你"提示但不暴露原始暗需求。

**演化路径**：F (独立 /matches 表单, 重复劳动) → F' (用户级私下需求, 颗粒度太粗) → **F'' (帖子级暗字段, 单入口)**

**信息架构**

```
Post
├── 明（public）
│   ├── content + tags
│   └── 公开 replies (任何人可回)
└── 暗（hidden）
    ├── match_intent  — 仅发帖人 + LLM 可见
    └── AI replies    — visibility='author_only', 仅发帖人可见
        ↳ 提及的 user 在 /me 收到提示，但看不到暗需求详情
```

**Schema 改动（最小）**

```sql
ALTER TABLE posts
  ADD COLUMN match_intent text;     -- 暗需求, nullable

ALTER TABLE replies
  ADD COLUMN is_ai boolean DEFAULT false,
  ADD COLUMN visibility text DEFAULT 'public'
       CHECK (visibility IN ('public','author_only')),
  ADD COLUMN mentioned_user_id uuid REFERENCES users(id);

DROP TABLE IF EXISTS matches;       -- 不再需要独立 matches 表
```

**算法 Pipeline**

1. **触发**：cron 30min × 1 + ≥3 条新暗需求事件触发
2. **批量 prompt**：收集所有未处理 match_intent 帖子 + 全场公开帖子摘要
   ```
   有暗需求的帖子：
   [post_a] @uid_aaa | 公开: ... | 暗需求: ...
   [post_b] @uid_bbb | 公开: ... | 暗需求: ...
   
   全场用户画像（公开帖聚合）：
   @uid_xxx | tags: ... | 帖子摘要: ...
   
   输出 JSON：每个 post_id → [{user_id, reason}]
   理由必须引用候选用户的具体公开帖子。
   ```
3. **写入 replies**：每条推荐生成一行 (is_ai=true, visibility='author_only', mentioned_user_id=推荐对象)
4. **dedupe**：同一 (post_id, mentioned_user_id) 已有 AI reply 则跳过

**两端体验**

发帖人 A（PostCard 下方）：
```
🤖 AI 撮合 · 仅你可见
推荐你和 @李四 聊聊 — 你私下提到想找 Booking 内推，
他在 Booking ML infra 4 年，发过 [Spark 调优笔记]。
[去看李四的帖子]
```

被推荐人 B（`/me` 新 section "有人想找你"）：
```
有人对你的 [Spark 调优笔记] 感兴趣 · 30min 前
[去看那条帖子]
```
不展示对方是谁、不展示暗需求。

**成本估算**
- 单次 prompt：~60 暗需求帖 (12k token) + 200 用户画像摘要 (30k token) ≈ 42k 输入
- 输出：60 × 5 × 80 token ≈ 24k
- DeepSeek-V3 单次：(42k×¥1 + 24k×¥2) / 1M ≈ ¥0.09
- 8 cron + ~4 事件触发 ≈ **¥1 / 场**

**优势**
- ✅ 单入口（composer 内附加，无需切 tab）
- ✅ 帖子级颗粒度（同人不同需求各自撮合）
- ✅ 暗需求不公开（隐私）
- ✅ 双向感知，但被推荐方看不到暗需求（开关 1 选 B）
- ✅ Schema 极简（删 matches 表）
- ✅ 成本 ~¥1/场（比方案 C/D 便宜 10 倍以上）
- ✅ `/matches` tab 直接废除（开关 2 选废除）

**劣势**
- LLM 黑箱（但输入结构化，比方案 D 稳）
- PostComposer 多一个折叠 UI 区域
- prompt engineering 要保证 LLM 输出引用 user_id + 公开帖子作为理由依据

**实现工作量**：~3 天

---

## 4. 对比矩阵

| | A: Tag | B: Embed | C: Need-Offer | D: 纯 LLM | E: 主动搜索 | **F'': composer 暗字段** |
|---|---|---|---|---|---|---|
| **输入来源** | 帖子 tags | 帖子文本 | 帖子文本 | 帖子文本 | 用户输入 | **公开帖 + 暗需求** |
| **入口** | 自动 | 自动 | 自动 | 自动 | /matches | **PostComposer** |
| **撮合语义** | 相似 | 相似 | 互补 | 混合 | 自定义 | **互补（用户声明）** |
| **算法层级** | 1 | 2 | 3 | 1 | 1 | **1（单 prompt）** |
| **外部依赖** | 无 | embedding | DeepSeek | DeepSeek | 无 | **DeepSeek** |
| **单场成本** | ¥0 | ¥5-15 | ¥8-12 | ¥10-30 | ¥0 | **¥1** |
| **实现工作量** | 1d | 2d | 3-4d | 2d | 0.5d | **3d** |
| **结果呈现** | /matches | /matches | /matches | /matches | /matches | **feed 内联 reply** |
| **隐私 / opt-in** | 否 | 否 | 否 | 否 | 是 | **是（暗字段不公开）** |
| **schema 复杂度** | matches 表 | matches 表 | matches 表 | matches 表 | 无 | **删 matches，改 replies** |
| **对应原始价值** | 部分 | 部分 | ✅ | 部分-✅ | 否 | **✅✅** |

---

## 5. 已决策：方案 F''

**最终方案：F''（composer 暗字段 + AI 内联回帖 + `/matches` tab 废除）**

关键决策记录：
- **粒度**：撮合输出 user→user，但通过 reply 内联到具体帖子上下文中
- **入口**：仅 PostComposer（鼓励发帖人；不发帖 = 不参与，自筛选合理）
- **结果呈现**：feed 内 AI reply（仅发帖人可见）+ `/me` 的"有人想找你"（被推荐人）
- **隐私**：暗需求绝不出现在公开界面，被推荐方也看不到
- **`/matches` tab**：废除
- **频率**：cron 30min + ≥3 条新暗需求事件触发
- **失败隔离**：LLM 调用失败 → 仅写日志，不创建 AI reply，下次 cron 重试
- **dedupe**：同一 (post_id, mentioned_user_id) 已推荐过则跳过

**对原 §6 待决策点的影响**：
- 粒度 → user→user (确定)
- 频率 → 30min + 事件触发 (确定)
- 对称性 → AI reply 是单向的（A 的 post 推荐 B），如果 B 也对 A 有暗需求，会从 B 自己的帖子产出独立 reply
- Cold start / opt-out / opinion 帖子 → F'' 自动消解

A-E 作为历史备选保留在文档里，仅供回溯。

---

## 6. 实现 checklist（F''）

按顺序：

**Schema migration**（`supabase/migrations/0004_match_intent.sql`）
- [ ] `posts` 加 `match_intent text`
- [ ] `replies` 加 `is_ai bool`, `visibility text`, `mentioned_user_id uuid`
- [ ] DROP TABLE matches（如果存在）
- [ ] RLS 策略：`match_intent` 仅 author 可读；`replies.visibility='author_only'` 仅 author 或 mentioned_user_id 可见

**前端：PostComposer**
- [ ] 加折叠区域"委托 AI 寻找匹配（私下，仅你可见）"
- [ ] textarea 200 字限制
- [ ] 提示文案 + 隐私说明

**前端：PostCard**
- [ ] 渲染 AI replies 时检查 visibility — `author_only` 仅 author 看到
- [ ] AI reply 视觉：机器人 icon + 淡蓝背景 + "撮合"标签

**前端：/me tab**
- [ ] 新 section "有人想找你"
- [ ] 查询：`replies WHERE is_ai=true AND mentioned_user_id=current_user`
- [ ] 显示：关联 post 的公开内容 + 时间，不显示 reply 内容

**前端：移除 /matches tab**
- [ ] 删除路由 `src/app/(gated)/matches/page.tsx`
- [ ] 移除 header nav 里的入口

**后端：撮合 Edge Function**（`supabase/functions/match/index.ts`）
- [ ] 查询所有未处理的 match_intent 帖子（用 last_processed_at 跟踪）
- [ ] 聚合全场公开帖子 → 用户画像
- [ ] 调 DeepSeek，prompt 见 §3 方案 F''
- [ ] 解析 JSON 输出，写入 replies (dedupe by post_id × mentioned_user_id)
- [ ] try/catch 包住所有 LLM 调用，失败写 `match_runs` 日志表

**Cron**（`supabase/migrations/0005_match_cron.sql`）
- [ ] pg_cron 30min 触发 edge function
- [ ] 事件触发：在 posts insert with match_intent 时 count，>=3 时调用

**Prompt engineering**
- [ ] 准备 5-10 条 mock 数据测试 LLM 输出格式
- [ ] 验证 reason 一定引用 user_id 和具体公开帖子
- [ ] 验证 dedupe 逻辑

**Secret**
- [ ] `secret get deepseek-dams-key` → 存到 Supabase Edge Function env

---

## 7. 下一步

- 方案：✅ F'' 已确认
- 开关：✅ §5 全部决定完毕
- 实现：依 §6 checklist 进行；预估 3 天

下一个 session 开工时直接读这份文档 + §6 清单照做即可。

---

## 8. 实现细节：发往 DeepSeek 的数据流（2026-05-03 补充）

> 队友 / Stakeholder 关注点：暗需求 + 公司 + 真名要发到境外 LLM，到底发什么、能不能漏？
> 本节给出**字段级**清单 + redact 实现，供隐私公告 / 合规审查参考。

### 8.1 入口：每条 cron 跑一次（默认 5 分钟）

`supabase/functions/match/index.ts` 给 DeepSeek 发**两条 message**：

| 角色 | 内容 | 是否含用户数据 |
|---|---|---|
| `system` | 固定文案：会议主题 + 推荐规则 + JSON 输出约定 | ❌ 纯模板 |
| `user` | `buildPrompt({candidates, profiles})` 输出 | ✅ 见 §8.2 |

system prompt 见 `supabase/functions/match/deepseek.ts`，纯静态字符串。

### 8.2 user prompt 字段清单

#### 部分 A：candidates — 这次要撮合的帖子（≤50 条）

来源：`post_match_intents` inner join `posts` ORDER BY created_at DESC LIMIT 50。

| 字段 | 来源 | 处理 |
|---|---|---|
| `post_id` | `posts.id` | 原值（自增整数，无 PII） |
| 作者 `user_id` | `posts.user_id` | 原值（UUID） |
| 板块 | `posts.section` | 标签化（"Presentation 1" 等） |
| 公开 body | `posts.body` | **redactContacts** |
| tags | `posts.tags` | 原值 |
| 暗需求 | `post_match_intents.intent` | **redactContacts** |

#### 部分 B：profiles — 全场用户画像（≤500 条最新帖聚合）

来源：`posts` join `users` ORDER BY created_at DESC LIMIT 500，按 `user_id` 聚合，每用户保留最近 5 条帖。

| 字段 | 来源 | 处理 |
|---|---|---|
| `user_id` | `users.id` | 原值（UUID） |
| display_name | 嘉宾→`vip_name`<br/>普通→`nickname`<br/>匿名用户→字面"匿名" | 原值 |
| affiliation | 嘉宾→`vip_title`<br/>普通→`company` | 原值 |
| 帖子 section | `posts.section` | 标签化 |
| 帖子 tags | `posts.tags` | 原值 |
| 帖子 body | `posts.body` | **redactContacts** + 截断到 120 字 |

### 8.3 不发送的字段（已确认）

| 字段 | 状态 | 来源 |
|---|---|---|
| `users.contact_handle`（联系方式） | ❌ select 根本不拉 | 数据库查询不包含 |
| `users.show_contact` | ❌ 同上 | 数据库查询不包含 |
| `users.recovery_token` | ❌ 同上 | 凭据，绝不出库 |
| `vip_tokens.password_hash` | ❌ 同上 | 凭据 |
| `replies` / `likes` / `poll_votes` | ❌ 不查 | 不属于撮合上下文 |
| `dm_messages` 私信内容 | ❌ 不查 | 物理隔离 |
| `last_seen_at` / `created_at` | ❌ 不进 prompt | 时间戳无撮合价值 |

### 8.4 兜底过滤：redactContacts

用户 UI 上已被提示"请勿在暗需求里写邮箱/电话/微信号"，但用户可能手滑。`supabase/functions/match/prompt.ts` 提供的 `redactContacts(text)` 是兜底防线，作用于所有进 prompt 的文本字段（candidate body / match_intent / profile post body）：

```ts
function redactContacts(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[已隐藏]')  // 邮箱
    .replace(/https?:\/\/\S+/gi, '[已隐藏]')                // URL
    .replace(/\d{10,}/g, '[已隐藏]')                        // ≥10 位连续数字
}
```

**已知短板**（明确不修，因为 false-positive 代价过高）：
- "138 1234 5678" 这种**带空格**的手机号穿透
- 微信号（混字母数字，正则无法可靠区分微信号与昵称/产品名）
- → 兜底失败 ⇒ 主防线（UI 提示）兜不住 ⇒ 个别敏感数据可能进 prompt
- 5/9 单场场景下评估为可接受残余风险

### 8.5 UI 知情同意（PostComposer 蓝色折叠区）

```
🤖 委托 AI 寻找匹配（私下，仅你可见）
    [textarea: 你的暗需求]
    这条不进时间线，结果以回帖形式仅你可见。
    ⚠️ 内容会发往 DeepSeek API 用于撮合。请勿在此填写邮箱 / 电话 / 微信号；
       系统已做基础过滤，但不能保证 100% 拦截。
```

明确告知 + 兜底 redact = 双重保险。

### 8.6 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 是否发送 contact_handle | **否** | LLM 不需要联系方式做匹配；用户在帖子上 reveal 是另一个独立流程 |
| 是否在 LLM 端做 redact | **否** | 不信外部 LLM 处理 PII；redact 在我方代码里（`prompt.ts`）做掉再发 |
| 用户在暗需求里手写联系方式 | **UI 提示 + 兜底 redact** | 不在前端校验阻挡（影响用户表达），仅警告 + 后端兜底 |
| 是否发送 user_id (UUID) | **是** | DeepSeek 返回 user_id 用于回填 reply.mentioned_user_id；UUID 本身无业务含义 |
