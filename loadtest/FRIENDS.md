# 朋友帮忙跑压测 — 上手指南

> 谢谢帮忙！这份说明大概 5 分钟搞定。
>
> 我们在 5/9 活动前要验证 250 人在线 / feed 写入广播放大的容量，单机模拟有客户端瓶颈，所以多台机器一起跑得到的数据更准。

## 你需要

1. **Node 20 或更新**（终端跑 `node -v` 看下；没有就去 [nodejs.org](https://nodejs.org/) 装 LTS）
2. **git**（macOS / Linux 系统自带；Windows 用 [Git for Windows](https://git-scm.com/) 或 WSL）
3. **zdw 私下给你的 4 个值**（Signal / 微信 / iMessage 都行，**别走 GitHub / 公开聊天**）

## 步骤

### 1. clone 仓库 + 装依赖

```bash
git clone https://github.com/zhaidewei/dams-meetup.git
cd dams-meetup
npm install
```

### 2. 创建 `loadtest/.env.friends`

这个文件不会进 git（已 gitignore）。复制下面这块到一个新文件 `loadtest/.env.friends`，把 zdw 给你的 4 个值填进等号后面：

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
EVENT_PASSWORD=
```

> 安全提示：`SUPABASE_SERVICE_ROLE_KEY` 是高权限 key，**别提交、别截图、别发到群里**。活动后 zdw 会换。

### 3. 跑一次小的，确认能通

```bash
bash loadtest/friend.sh --users 5 --duration 30
```

预期看到：
```
=== load test ===
target:     https://live.nl-dams.com
users:      5
duration:   30s
...
[5s] http_login=... realtime_subscribed=... rt_posts=...
...
=== final stats ===
http_feed_ok                 ...
http_feed_ms      n=...   p50=...  p95=...
realtime_subscribed          5
...
=== cleanup ===
removed 5 test users
```

如果看到 `realtime_subscribed: 5`（等于你的 `--users`），说明 5 个虚拟用户都正常订阅了 Realtime，连接通。

### 4. 跑正式的

跟 zdw 同步好时间（多机要同时压才有意义），然后跑：

```bash
bash loadtest/friend.sh --users 30 --duration 180 --out ~/dams-loadtest-result.json
```

参数怎么挑：

| 你的机器 | `--users` | `--duration` |
|---|---|---|
| 笔记本（4-8 核） | 30 | 180 |
| 桌面 / Mac mini（8+ 核） | 50 | 180 |
| 多 cores 服务器 | 80 | 180 |

`--rampup` 默认 60 秒，不用动。

### 5. 把结果发回来

跑完终端最后那段 `=== final stats ===`：

- 截图发给 zdw，**或者**
- 把 `~/dams-loadtest-result.json` 发回来（格式化好的 JSON，几 KB）

## 多进程（机器够强可选）

单 Node 进程在 50 用户后 event loop 容易拥塞，机器够强可以多开几个进程，每个进程绑不同 PID 的测试数据，互不冲突：

```bash
for i in 1 2; do
  bash loadtest/friend.sh --users 40 --duration 180 --out ~/dams-friend-$i.json &
done
wait
node loadtest/aggregate.mjs ~/dams-friend-*.json
```

最后把 aggregate 输出截图发回来即可。

## 常见问题

**Q：`bash: loadtest/friend.sh: Permission denied`**
A：`chmod +x loadtest/friend.sh`，或者用 `bash loadtest/friend.sh ...` 显式调用。

**Q：`missing env: ...`**
A：`.env.friends` 里某个值没填或漏了等号，重新检查。

**Q：`refuse: target points to production`**
A：脚本默认就给生产做了 opt-in，正常不会触发。如果触发了，说明你改过 `LOADTEST_TARGET`，恢复默认即可。

**Q：跑到一半网卡卡了 / 终端挂掉**
A：未清理的测试数据 zdw 这边活动后会统一删，不用担心。继续重跑就行。

**Q：会不会影响线上真实用户？**
A：会有少量（写入概率 10%，30 用户 180 秒大概 50-100 条带 `[loadtest]` 前缀的帖子和 like）。已经跟 zdw 同步过测试时间窗，不冲突。

---

有任何问题直接联系 zdw。再次感谢！
