# 抽奖 v2 设计 — 演到停才定 + 透明池子

> 状态：设计中 · 待实施
> 替代：v1（migration 0016 + `startLotteryAction` 单步落 winner + 服务端预定结果）
> Owner：zdw
> 范围：5/9 现场抽奖（≤300 人，单场，2-5 轮）

---

## 1. v1 复盘与第一性原理重审

### v1 的问题

v1 的核心模式是：admin 点"开始抽奖" → server 当即 `crypto/Math.random` 选好 winner → 写 `lottery_draws.winner_user_id` → 前端播 5s 动画当表演。技术上能跑，但有两类硬伤：

| 类别 | 具体 | 影响 |
|---|---|---|
| 性能 / 正确性 | `must_have_posted` 分支用 `.in('user_id', pool)` 查 posts，没 distinct、没 limit；pool 大时撞 PostgREST 默认 1000 行 cap + URL 长度上限 | 200 人活动中后期可能静默漏掉发帖人，结果是"看似公平实则偏" |
| 公平 / 信任 | winner 在动画前已定，pool 隐藏不可见。观众肉眼能看到的只有结果 → 必须信任主办方 | 主办方完全可以"内定" 谁中奖，技术上不可证伪 |

### 重新审视：现场抽奖到底要解决什么

四个目标在打架：

| 目标 | 极端做法 | 极端代价 |
|---|---|---|
| 公平 | 撒纸条 | 没体验、没激励 |
| 体验 / 戏剧性 | 主持人喊停跑马灯 | 主持人本质上选了结果 |
| 激励参与 | 完全按发帖数加权 | 不再是抽奖是评选 |
| 可信 | commit-reveal 协议 | 200 人活动里成本远超收益 |

v1 把全部赌注押在"公平"（`Math.random` 数学上无偏），但牺牲了"可信" —— 而抽奖最值钱的偏偏是观众肉眼相信。v2 要把"可信"和"体验"作为优先级最高的两条。

---

## 2. v2 核心决策（4 条）

### D1. winner 的决定时刻后移到动画停帧

不再 `start → server pick winner → 播表演动画`。改成：

```
admin 点"开始" → server 冻结 pool（含权重）+ 生成 random_seed → 写 lottery_draws（winner=null）
                ↓
        切 event_state.screen_mode='lottery'
                ↓
            大屏接收 broadcast，进入抽奖三段式：
                A. 候选预览  2-3s   滚动展示池子全员
                B. 跑马灯    4-6s   加速 → 减速
                C. 揭晓      ∞      停帧瞬间才向 server 请求 winner
                              ↓
                    server crypto.randomInt 在加权池里抽
                    update lottery_draws.winner_user_id + closed_at
                              ↓
                    礼花 + 中奖人放大
```

**为什么这是关键改动**：从"先定再演"变成"演到停才定"。主持人无法挑时机选人（他甚至不知道按 stop 那一刻会落到谁），server 也没机会内定（resolve 那一刻才 randomInt）。技术上不可作弊 ≠ 观众相信不作弊，但**至少把"主办方完全控制结果"这条物理通路切掉了**。

### D2. pool 透明化

v1 的 `lottery_draws` 因为"pool_user_ids 隐私"刻意不进 publication、anon 读不到。这是过度设计 —— 抽奖池里有谁本来就是公开活动的公开事实（昵称/company 在 feed 上谁都能看见）。

v2 在大屏 A 阶段（动画前 2-3s）滚一遍候选人头像 + 昵称拼贴，让每个人肉眼看到"我在/不在池子里"。这是信任的最大杠杆。

### D3. 加权但封顶 3 票

完全均匀抽对积极发言的人不公平；完全按发帖数加权又不像抽奖。中间方案：

```
weight(user) = 1                              // 基础票
             + (发过 ≥1 timeline 帖 ? 1 : 0)
             + (被回复 ≥1 次       ? 1 : 0)
cap = 3
```

最积极的人中奖率最多 3x，**保留素人中奖的惊喜感**。规则在大屏 footer 永远可见，且每个 user 的 weight 写进 `pool_snapshot`，事后可逐人核对。

加权可关 —— admin toggle 默认开。如果某轮想要"纯随机"，关掉即可（每人 1 票）。

### D4. 承认完全去信任化不值得

不做 commit-reveal、不做链上 VRF、不做实物骰子映射。这些方案的成本（实现复杂度 + 现场运营出错风险）远超 200 人活动需要的可信度。v2 的可信度链路是：

1. pool 在大屏明文展示（D2）→ 谁在池子里观众自己确认
2. winner 在动画停帧才结算（D1）→ 主办方/server 都没有"先选好"的物理通路
3. random_seed 写库 + lottery_draws history 大屏可调出 → 事后审计

这三条加起来，**社会层面够用**，技术层面承认有信任 gap（admin 可以伪造 randomInt 的实现），但这个 gap 用任何方案都关不掉，除非全员跑客户端验证。

---

## 3. 数据模型

### 3.1 `lottery_draws` 改造（migration 0021）

```sql
alter table lottery_draws
  -- 允许 "已开抽未揭晓" 的中间态
  alter column winner_user_id drop not null,
  -- 揭晓时间戳；null = 还在转
  add column closed_at timestamptz,
  -- 加权池快照：{<uid>: <int weight>}
  add column pool_weights jsonb not null default '{}'::jsonb,
  -- 抽签随机种子（事后审计可复现）
  add column random_seed bytea;

-- 防止 closed_at 与 winner_user_id 状态分离
alter table lottery_draws add constraint lottery_draws_close_consistency check (
  (closed_at is null and winner_user_id is null)
  or (closed_at is not null and winner_user_id is not null)
);
```

`pool_user_ids` 字段保留（v1 已写入，且作 uid 列表的来源仍然方便）；`pool_weights` 是新增的 uid → weight 映射。两者一起构成池子快照。

### 3.2 `event_state_mode_consistency` 不动

约束依然是 `mode='lottery' ⇔ lottery_draw_id is not null`。lottery_draws.winner 是否为 null 不进入这个约束 —— 也就是说，screen_mode='lottery' 期间 winner 可以为 null（A/B 阶段），也可以非 null（C 阶段）。

### 3.3 RPC `compute_lottery_pool(rules jsonb)` 取代客户端 IN 查询

```sql
create or replace function compute_lottery_pool(
  rules jsonb,
  online_window_seconds int default 600
) returns table (user_id uuid, weight int) ...
```

在 DB 一次跑完所有 filter + 权重计算，回到 server 只是 `(uid, weight)[]`。彻底解决 v1 的：

- `IN` 列表 URL 长度上限
- posts query 默认 1000 行 cap
- distinct 缺失

详见 migration 0021 注释。

### 3.4 Realtime 链路

不动。`event_state` 在 publication 里、`lottery_draws` 不在。

- A → B → C 三阶段切换：客户端纯 setTimeout，**不依赖 Realtime**（A/B 是表演，没有 server-side 状态切）
- C 阶段揭晓后 update `lottery_draws.winner + closed_at` —— 但这张表不广播，所以怎么让大屏拿到 winner？

**答**：resolveLotteryAction 是 server action，client 在动画停帧时 `await` 它，返回值就含 winner profile。大屏自己拿到，无需 Realtime 回传。其他 client（如果有第二块大屏）依然要走 fallback interval refresh，但单场只有一台投影，可忽略。

---

## 4. 三阶段流程

### 阶段 A —— 候选预览（2-3 秒）

**目的**：让观众肉眼确认池子。

**画面**：
- 顶部 banner：「即将抽奖 · 池子 187 人 · 加权 1-3 票」
- 中央滚动栅格：所有 pool user 头像 + 昵称拼贴（30+ 人时分批 fade-in）
- 底部规则文案：「近 10 分钟内活跃过 · 必须发言过 · 排除上轮中奖者」

### 阶段 B —— 跑马灯（4-6 秒）

**目的**：戏剧性、悬念。

**画面**：
- 中央巨型卡片快速切换头像
- 80ms → 500ms 缓动减速
- 顶部 banner：「抽奖中…」
- 减速到最后一帧，client 调用 `resolveLotteryAction(drawId)`

### 阶段 C —— 揭晓（直到 admin 退出）

**目的**：高潮、记录。

**画面**：
- 中奖人头像放大、scale 1.1、glow
- 文案：「🎉 中奖！{昵称}」
- 副标：公司 + VIP 标签
- 底部审计行：「draw #5 · seed `a3f2..1c` · pool 187 人 · 加权 1-3」
- 礼花特效（CSS 动画）

退出由 admin 在控制条点"结束抽奖"触发（沿用 v1 的 `exitScreenModeAction`）。

---

## 5. 池子定义（默认规则）

```
WHERE last_seen_at >= now() - 10 minutes        -- 比 v1 的 5min 放宽，配合下面 D5
  AND id != all(<excluded VIPs ids if rule on>)
  AND (
        rule.must_have_posted = false
        OR id IN (select user_id from posts UNION select user_id from replies UNION select user_id from poll_votes)
      )
  AND (
        rule.exclude_previous_winners = false
        OR id NOT IN (select winner_user_id from lottery_draws where winner_user_id is not null)
      )
```

### D5. `last_seen_at` 打点扩展到所有 gated 路径

v1 只在 `/feed` 打点 `last_seen_at`。停在 `/me` `/agenda` 看了 10 分钟的人被静默排除。v2 把 `touchLastSeen` 加到 `/me` `/agenda` `page.tsx` 顶部（最低成本修复，没有 `(gated)` layout group 可挂）。

### D6. "必须发言过" = 帖 OR 回复 OR 投票

v1 只算 timeline post。v2 包含 reply 和 poll_vote —— 现场听众没主动发帖但点了赞、回复过别人也算"参与"。

### D7. 加权计算

```
weight = 1 (base)
       + (1 if user has >= 1 timeline post)
       + (1 if user has been replied to >= 1 time)
cap 3
```

注意"被回复"是给"出过题被讨论"的奖励 —— 比"自己回了别人"更好，避免灌水回复刷权重。

---

## 6. UI 改动清单

### `/screen` ScreenAdminBar

抽奖控制区新增：
- ✅ "必须发言过（帖/回复/投票）" 文案改清晰
- ✅ "排除上轮中奖者"
- 🆕 "启用加权（发帖+1，被回复+1，封顶3）" toggle，默认开
- 🆕 "排除 VIP" toggle，默认开

### `/screen` LotterySlot

完全重写为三阶段状态机。phase 由 client 时钟驱动（不依赖 server），仅在 B → C 切换时调一次 `resolveLotteryAction`。

### `lottery_draws` 历史调阅

砍掉。单场 ≤ 5 轮，主持人记得住，`/screen` 不另外做 history viewer 节省工。如果事后要审计，直接 SQL 查表。

---

## 7. 与 v1 对比

| 维度 | v1 | v2 |
|---|---|---|
| winner 决定时刻 | 点"开始"时 server 选好 | 动画停帧瞬间 |
| 池子透明度 | 隐藏（pool_user_ids 不广播） | 大屏 A 阶段滚动展示 |
| `must_have_posted` 语义 | 仅 timeline post | post / reply / poll_vote |
| `last_seen_at` 打点范围 | 仅 /feed | /feed /me /agenda |
| 加权 | 无（人均 1 票） | 1-3 票，可关 |
| pool 计算 | server `.in()`，撞 1000 行 + URL 长度 | RPC `compute_lottery_pool` |
| 随机源 | `Math.random()` | `crypto.randomInt()` |
| 审计字段 | 无 random_seed | random_seed + closed_at |

---

## 8. Out of scope（明确不做）

- **commit-reveal / VRF**：成本远超收益
- **客户端共同决定随机数**：需要全员在线参与
- **实物骰子 + 编号映射**：运营复杂、出错翻车
- **多轮抽奖的奖品库存管理**：单场 5 轮以内，主持人手工记
- **lottery_draws history viewer**：单场量少，需要时直接 SQL
- **中奖人现场领奖二维码核验**：v1 没做，v2 也不做（人到现场拿即可）

---

## 9. 失败/降级

| 故障 | 表现 | 降级策略 |
|---|---|---|
| `compute_lottery_pool` RPC 报错 | 抽奖按钮报错，不切 mode | admin 看到 toast，活动其它部分不受影响 |
| pool 为空（规则太严） | startLotteryAction 返回 error | admin 调 toggle 重试 |
| `resolveLotteryAction` 超时 | C 阶段卡在跑马灯尾巴 | client 5s 兜底重试一次；仍失败显示「网络错误，请刷新大屏」 |
| event_state realtime 丢 broadcast | 大屏不进抽奖 mode | 大屏 15s fallback interval 兜底（已有） |

---

## 10. 实施顺序

1. migration 0021 — schema 改造 + RPC
2. `startLotteryAction` 改写 — 调 RPC，winner=null 写入
3. `resolveLotteryAction` 新增 —— `crypto.randomInt` 落 winner
4. `fetchLotteryDraw` 调整返回字段 —— 包含 closed_at / pool_sample with weights
5. `LotterySlot` 重写为三阶段
6. ScreenAdminBar 加 toggle
7. `/me` `/agenda` 加 `touchLastSeen`
8. 本地 dev 跑通三阶段
