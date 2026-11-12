# Meetup 15 隔离压测

在仓库根目录运行。需要 Node.js 22、npm 和可运行 Chromium 的桌面或 CI 环境。

```sh
npm ci
npx playwright install chromium
bash loadtest/meetup15/start.sh
```

Linux CI 可用 `npx playwright install --with-deps chromium` 安装系统依赖。测试在 127.0.0.1 上自动分配端口。启动脚本使用 Wrangler 的 dry run 打包 Worker，在 Miniflare 中应用本地 D1 迁移。每轮使用全新内存数据库和公开的本机测试凭据。

脚本模拟 200 人每批 25 人扫码、进入讨论区、集中提问和刷新、点赞、断线重连，并用 Chromium 检查大屏更新和抽奖，最后对账问题、点赞和中奖私信。HTTP 并行连接默认 48。WebSocket 默认每批握手 25 个，已连上的会话保持在线，提问阶段有 200 个观众连接。用 `DAMS_WS_BATCH=200 bash loadtest/meetup15/start.sh` 复现同一瞬间发起全部握手的场景。

通过条件包括扫码和提问 p95 各不超过 2 秒，大屏在写入确认后 2 秒内展示排名前三的问题，无失败请求或浏览器 5xx，且数据库对账相符。终端输出结果目录，成功时查看 `results.json` 和 `d1.json`，失败时查看 `failed.json` 和启动日志。脚本结束后会停止本机 Worker，保留报告。

## #85 对照与指标

```sh
DAMS_M6_MATRIX=1 bash loadtest/meetup15/start.sh
```

矩阵依次用 48 / 200 条 HTTP 连接与 25 / 200 个 WebSocket 握手一批的组合，每组重新创建 D1。报告记录 p50、p95、p99、失败数、HTTP 派发等待、响应字节数，以及 Worker、D1、通知与缓存指标。派发等待包含连接建立，响应字节数为浏览器解析前的正文大小。两种集中 feed 读取分别检查 p95 ≤ 2 秒，500 ms 作为独立的提效目标。

脚本先统一重连并读取，再模拟客户端逐个连上后立即读取。第二轮验证旧题标记已答后能补位，同时检查点赞与作者标记按当前登录身份返回。另用两个真实浏览器会话和投影页测量点击提问到页面显示的时间。最终对账还覆盖抽奖和中奖私信。

远程测试只接受专用 `dams-meetup-perf-85-*.workers.dev` Worker 和全新 D1。Worker 需要单独绑定 D1、Durable Object、两项限流、静态资源及自身 service，观测入口需要独立的 `DAMS_M6_OBSERVER_TOKEN`。设置 `DAMS_M6_REMOTE=1`、`DAMS_M6_ADMIN_TOKEN` 和观测密钥后，运行 `node loadtest/meetup15/run.mjs <报告目录> <隔离 Worker URL>`。远程 `d1.json` 是单个 isolate 的采样，客户端 `results.json` 汇总收到的响应计时。

用 `DAMS_M6_LIVE_UPDATES=1 DAMS_M6_CONNECTIONS=200 DAMS_WS_BATCH=25 bash loadtest/meetup15/start.sh` 对比实时问答。200 人保持在线，同时提交问题。客户端按 Worker 的通知或增量消息更新，报告 `liveQa.visible` 记录从集中提交开始到每个客户端收到整批问题的耗时。`liveQa.httpRequests` 统计这批通知触发的讨论区请求，`workerReads` 和 `objectReads` 分别统计 Worker 读请求和 Durable Object 广播在这段时间的 D1 绑定调用。关闭该选项可复跑原有的 200 人强制刷新场景。

## 从 200 人彩排预设开始

```sh
DAMS_M6_REHEARSAL=1 DAMS_M6_LIVE_UPDATES=1 bash loadtest/meetup15/start.sh
```

此模式先通过后台填入 200 位模拟观众和预设互动，再用这 200 个账号连接、集中提问、点赞和断线补拉。预设问答会先结束并留在历史中，新一轮问答用于测量。此模式跳过扫码阶段。跑扫码压测时使用默认模式。

远程复跑仍限专用隔离 Worker 和全新 D1。此模式另外要求 `DAMS_M6_SESSION_SECRET` 与隔离 Worker 的会话密钥一致，且隔离 Worker 的活动时间须在彩排截止前。会话只为本轮填充的模拟账号生成。

## 模拟现场互动节奏

```sh
DAMS_M6_FIELD=1 bash loadtest/meetup15/start.sh
```

复用彩排预设的 200 个账号。196 个脚本连接和 4 个手机浏览器会话同时在线，另开 4:3 投影页。脚本会话错开执行每 15 秒一次的兜底读取。3 人轮流提交共 24 条问题，每 3 条做一次点赞，并在下一条开始前标记已答。报告分别记录点击提交到自己手机、另一位观众手机和大屏出现问题的时间。随后让 25 个脚本连接断开，在断线期间写入一条问题，重连后核对全部 25 份快照。
