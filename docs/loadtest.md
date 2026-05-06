# 压测框架

> 状态：已用于 5/9 前的容量验证
> 目的：5/9 当天 ~250 人同时在线，`/feed` 带 Realtime 广播放大，验证不会被打爆
> Owner：zdw

---

## 概述

DAMS Meetup #14（2026-05-09，约 250 人）核心交互是 `/feed`：每个写操作都会通过 Supabase Realtime 广播给所有在线客户端，客户端 `router.refresh()` 重新 SSR 整张 timeline。这种 fanout 模式下 N 个用户的总负载是 O(N²)。压测框架就是要在活动前把这个曲线跑出来，看 N=250 是死还是只是慢。

具体要回答的问题：

- Supabase（Free / Pro）能撑多少 Realtime concurrent
- Cloudflare Workers Free 10ms CPU/req 能不能扛 SSR
- `fetchFeed` 的 join 在真实数据量下 p95 多少
- Realtime debounce 调到多少不会自我引爆

不回答的问题：

- React Server Action 的吞吐（程序化触发不现实，见下文）
- 真人浏览器渲染时间
- AI 撮合 edge function 的容量（不在临界路径）

---

## 测试框架结构

### loadtest/ — 压测脚本

| 文件 | 职责 |
|---|---|
| `run.mjs` | 入口。`parseArgs` 读 CLI flag，spawn N 个 `VirtualUser`，定时打印 stats，结束跑 cleanup |
| `user.mjs` | `VirtualUser` 完整生命周期：密码门 → `/feed` 拉取 → Realtime 订阅 5 张表 → 90/10 读写循环 |
| `stats.mjs` | counter + reservoir-sampled 直方图（reservoir size 1024），输出 p50/p95/p99 |
| `cleanup.mjs` | 按 `users.contact_handle` 前缀删除测试数据，FK ON DELETE CASCADE 自动清下游 |
| `seed.mjs` | 注入基线数据（users / posts / likes / replies），handle 前缀 `SEED-<pid>-*` |
| `aggregate.mjs` | 合并多个进程 / 多机的 stats JSON。counter 求和，latency sample 拼接后重新算百分位 |

### scripts/ — Keychain 包装

| 文件 | 职责 |
|---|---|
| `loadtest.sh` | 从 macOS Keychain 取 `dams-event-password` / `supabase-dams-*`，注入环境变量后 `exec node loadtest/run.mjs "$@"` |
| `seed.sh` | 同上，针对 `seed.mjs`。需要 `NEXT_PUBLIC_EVENT_START` / `NEXT_PUBLIC_EVENT_END` 决定 seed 时间戳分布 |

### 关键设计决策

**为什么是 Node 不是 Rust / Go**
Supabase Realtime 跑 Phoenix WebSocket 协议（`phx_join` / heartbeat / `phx_leave` / 自定义 ack），生产级客户端只有 `@supabase/supabase-js`。Rust / Go 重写要手搓 Phoenix 协议，一次性活动不值。Node 的 event loop 限制下面用多进程绕开。

**写操作直接打 service_role，不走 Server Action endpoint**
Next.js Server Action 调用需要 React 给函数签的 id（每次 build 变），程序化触发不现实。压测打的是 **DB + Realtime 容量上限**，不是 Server Action 路由本身。代价是登录走 fallback：`POST /` 拿不到 cookie 时直接 service_role insert 一行 `users`，再合成 `dams-uid` cookie。

**多进程隔离**
单 Node 进程 event loop 在 50-80 用户后就被自己的 Realtime 回调撑爆。`run.mjs` 用 `process.pid` 作 cleanup 前缀（`LOADTEST-{pid}-*`），多个进程互不冲突。

**多机扩展**
同样模式：`scp -r loadtest/ user@host2:/tmp/`，那台机器跑同一个脚本，结束 `scp` JSON 回来 `aggregate.mjs` 合并。

---

## 怎么用

### 常用命令

```bash
# Seed baseline（200 users / 400 posts / 1500 likes / 500 replies）
./scripts/seed.sh
./scripts/seed.sh --cleanup                         # 删 SEED-* 全部行

# 默认 localhost:3000
./scripts/loadtest.sh --users 50 --duration 120

# 指定 target + 输出 JSON
./scripts/loadtest.sh --target http://localhost:3001 --users 50 --duration 120 --out /tmp/s.json

# 打生产（需要显式 opt-in）
LOADTEST_PROD_OK=1 ./scripts/loadtest.sh --target https://live.nl-dams.com --users 30

# 合并多进程结果
node loadtest/aggregate.mjs /tmp/s*.json
```

### 多进程 recipe（≤80 用户 / 进程）

```bash
for i in 1 2 3 4 5; do
  ./scripts/loadtest.sh --users 50 --duration 180 --out /tmp/s${i}.json &
done
wait
node loadtest/aggregate.mjs /tmp/s*.json
```

### CLI flags

| flag | 默认 | 说明 |
|---|---|---|
| `--users` | 250 | 虚拟用户数 |
| `--duration` | 300 | 测试时长（秒） |
| `--rampup` | 60 | 用户均匀 spawn 的窗口（秒） |
| `--target` | `http://localhost:3000` | 被测 URL |
| `--write-rate` | 0.1 | 每 tick 写操作概率 |
| `--out` | — | JSON stats 输出路径（多进程必填） |
| `--no-cleanup` | false | 保留测试数据，事后手动清 |
| `--dry-run` | false | 打印配置后退出 |

---

## 测试发现（chronological）

按时间顺序，能看出优化的演进路径。

### 第一次：50 users / dev server (`localhost:3000`, `npm run dev`)

p50 17.5s, p95 26.8s。基本不可用。

教训：dev server 的 Turbopack 按需编译撑住了大头，跟生产没有可比性。**永远不要在 dev server 上做容量结论**。

### 50 users / prod build (`localhost:3001`, `npm run start`)

p50 2.3s, p95 6.4s。比 dev 好得多但 p95 仍不健康。生产 build 消除了 ~8x 编译开销，剩下的就是真实架构问题。

### 架构诊断

读 `src/lib/queries/posts.ts` 老版本：

- L98-99 的 `sb.from('likes').select(...)` 与 `sb.from('poll_votes').select(...)` 是 **整张表 select**（没有 IN 过滤）。每次 feed 渲染都全表扫，likes / votes 越多越慢
- `src/components/FeedRealtime.tsx` 的 `DEBOUNCE_MS = 500` 太激进：每个写广播 → 250 个客户端在 500ms 内全部 refresh → 每个 refresh 触发上面的全表扫 → DB 反过来卡写操作的 event loop

### 优化 A + B

**A**：`fetchFeed` 改两步取数。先拿 posts 学到 `postIds`，再 `likes` / `poll_votes` / `post_match_intents` 用 `IN (post_ids)` scope。`src/lib/queries/posts.ts` L96-122 是当前实现。`src/lib/queries/questions.ts` 同样修。

**B**：`FeedRealtime.tsx` 的 `DEBOUNCE_MS` 从 500ms 改到 2500ms。感知响应几乎没差，refresh fanout 减少 4-6x。

### 50 users / prod build / A+B

p50 965ms, p95 2.6s。p95 提升 2.5x。写延迟也回到正常水平（之前被 read 压力间接拖累）。

### 250 users / prod build / A+B（Free tier Supabase NANO compute）

架构崩了：

- p50 19.4s, p95 92s
- 典型 Realtime backpressure 模式：counter 大段不动然后突然爆量上涨，明显 Supabase 在排队 / 丢消息
- Supabase 返回 522 Connection Timed Out
- 10/250 fetch 失败，15/250 Realtime subscribe `TIMED_OUT`

根因：**Free tier 是天花板**。200 Realtime concurrent / 共享 CPU / 0.5 GB RAM / 2M Realtime msg/月，250 个长连接 + 持续广播直接打穿。

### 2×30 users（多进程模式验证）

localhost:3001 与 CF prod 都跑过。`aggregate.mjs` 跨进程合并正确，PID 前缀 cleanup 互不冲突。多进程范式工作。

### 60 users / localhost:3001 / seeded DB

200 users / 400 posts / 1500 likes baseline 注入后跑：

- p50 3161ms, p95 7475ms, p99 10841ms

比之前空表的 p95 2.6s 高得多。**之前的空表测试在低估真实延迟** —— full-table scan 在空表上当然便宜，但生产环境永远不会是空表。Seeded 数据是更诚实的基线。

### 60 users / CF prod (`live.nl-dams.com`) / seeded

- p50 927ms, p95 2.9s —— 比 localhost prod build **更快**
  - CF V8 isolate 有 warm pool，没 Node cold-start
  - 边缘节点 Amsterdam 离 Supabase Eindhoven 近
  - Mac 跑 `npm run start` 是单进程 Node，event loop 是瓶颈
- BUT：507 / 1614 = 31% 请求 4xx / 5xx
- 假设：CF Workers Free 10ms CPU/req 杀掉了慢 SSR（`fetchFeed` 在 seeded 数据上做 10+ 个 DB query）

注意：当前 latency 数字包含失败响应的耗时（见下面 caveat），错误率高时 latency 实际比报告的低。

---

## 价格与档位结论

两个独立瓶颈，两个独立升级：

| 服务 | Free 限制 | 建议 | 价格 |
|---|---|---|---|
| Cloudflare Workers | 10ms CPU/req · 100K req/day | Paid（50ms CPU · 10M req/月） | $5/月 |
| Supabase | 200 Realtime concurrent · NANO 共享 CPU · 0.5GB RAM · 2M msg/月 | Pro + MICRO/MEDIUM compute | $25/月 + compute 小时计费（5h 活动 ~$0.10–0.40） |

错误码读法：

- 5xx / 524 来自 CF → Workers CPU timeout（升级 Workers）
- 522 / Connection timed out → Supabase 容量爆（升级 Supabase compute）
- Realtime subscribe `TIMED_OUT` → Supabase Realtime concurrent cap（升级 Supabase Pro）

---

## 框架已知问题

- `user.mjs::visitFeed` 先记录 latency 再判断 status code，所以 `http_feed_ms` 包含失败响应的 time-to-failure。错误率高时 latency 报告偏高，真实成功请求 latency 比看到的低。
- 登录 HTTP 4xx 是预期的（Next.js Server Action 签名 mismatch，程序化调不通），脚本走 service_role fallback 直接建用户。**真实登录 latency 与 Server Action 容量没被测**。
- 单进程 Node 在 50-80 用户后 event loop 自我拥塞。更高并发必须多进程。
- Free tier Supabase 200 Realtime concurrent 是硬天花板，Free 上跑 250+ 一定部分失败，跟代码优化无关。

---

## TODO

- `user.mjs` 错误分类：拆 4xx / 5xx / network，分别计数
- Supabase Pro + Workers Paid 升上去后，重跑 250 users + 完整活动窗口模拟
- 考虑 postgres trigger 维护 `posts.like_count` / `posts.reply_count` 列，彻底干掉 aggregate fetch
