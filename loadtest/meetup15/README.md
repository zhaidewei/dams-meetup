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
