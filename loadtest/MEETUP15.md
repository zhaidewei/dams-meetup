# Meetup 15 多人压测

每台电脑安装 Node.js 22 或更新版本即可运行，无需安装项目依赖。脚本通过观众入场接口创建独立会话，凭据从环境变量 `DAMS_ENTRY_PASSWORD` 读取。组织者私下提供测试站点的观众入口密码。

组织者统一提供测试 URL、批次名和未来的开跑时间（带时区的 ISO 格式），建议提前至少 2 分钟启动各台机器。参与者使用相同的批次、时间、时长和场景，每台机器选不同的 `--client`，电脑开启自动校时。以下命令在仓库根目录运行，把时间、地址和机器编号换成组织者给出的值。

```sh
node loadtest/meetup15.mjs --target https://your-test-host.example --allow-remote --run drill01 --client pc01 --users 80 --seconds 120 --start-at 2026-11-14T10:00:00+01:00
```

先用 `--users 5 --seconds 15` 做小规模预演。macOS/Linux 可以用 `read -rs DAMS_ENTRY_PASSWORD; export DAMS_ENTRY_PASSWORD` 输入密码。PowerShell 7 可用 `$env:DAMS_ENTRY_PASSWORD = Read-Host -MaskInput '测试站点观众入口密码'`。跑完后可在各自终端清除环境变量。

脚本先入场并设置昵称，到约定时刻才开始发帖、点赞、回复和周期性刷新。每台机器默认模拟 80 个会话，三台合计 240 个。峰值问答场景在所有机器的命令上加 `--questions`，组织者在开跑前开启一轮问答。到点时，每个会话各发一次问题并刷新该板块。报告分别记录 `question` 和 `peak_refresh`。脚本会写入标记为 `LT-批次-机器` 的测试数据，使用隔离环境，或由组织者约定生产测试窗口和清理方式。

每人把生成的 `LT-批次-机器.json` 交给组织者。报告包含请求计数、失败原因、逐请求成功延迟、运行时间和测试身份 ID，供汇总和清理。组织者汇总同一场压测的文件。

```sh
node loadtest/aggregate.mjs LT-drill01-pc01.json LT-drill01-pc02.json LT-drill01-pc03.json
```

汇总工具用各机器的原始毫秒样本计算整体 p50、p95 和 p99。结合失败计数读结果，超时和失败单独计数。按实际开跑时间对齐两侧数据。

- **参与者电脑**记录 HTTP 往返延迟和失败率，包含接入网络、Cloudflare 和服务端处理时间。用这个结果验收提问 p95 ≤ 2 秒、峰值刷新零失败。本脚本覆盖 HTTP，浏览器渲染、WebSocket 推送和投影延迟需要独立测量。
- **Cloudflare**用同一时间窗看 Worker 请求量、错误、CPU 时间、请求耗时，以及 D1 的查询延迟和读写行数，帮助定位慢点与容量瓶颈。 [Workers 观测](https://developers.cloudflare.com/workers/observability/) · [D1 指标](https://developers.cloudflare.com/d1/observability/metrics-analytics/)
