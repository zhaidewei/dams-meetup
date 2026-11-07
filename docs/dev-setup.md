# 第 15 期开发与发布

## 本机开发

使用 Node.js 22。首次启动前安装锁定的依赖。

```bash
npm ci
npm run dev
```

打开 `http://127.0.0.1:3000`。启动命令会把 `migrations/` 应用到本机 D1，构建 Worker 并监听回环地址。管理员在 `/admin` 使用测试密码 `dams-local-admin`。在 `/admin` 切换开场介绍和现场互动。投影只打开 `/screen`，用左右方向键翻开场幻灯片。开闸后，现场互动首页和开场最后一页会显示本机测试二维码和入场密码。启动和测试只需要本机的测试值。本机站点沿用本届活动时间，11 月 14 日 18:00 CET 后停止首次入场。自动化入场测试使用独立的测试时间，可在活动结束后继续运行。

本地 D1 默认保存在 `.wrangler/state`。可以用 `DAMS_DEV_STATE_DIR` 指向新目录以从空库开始，用 `DAMS_DEV_PORT` 指定空闲端口。修改源码后重启 `npm run dev` 以重新构建。`npm run preview` 使用同一条启动路径。

```bash
npm test
npm run typecheck
npm run lint
```

默认测试使用隔离的 D1 测试库。第 14 期 Supabase 连通性测试需显式执行 `DAMS_TEST_LEGACY_SUPABASE=1 npm test`。

## 生产发布

生产 Worker 为 `dams-meetup`，服务 `live.nl-dams.com`。在 Cloudflare 上确认 `ACTIVITY_DB` 绑定到 `dams-meetup-15`。管理员密码和会话签名密钥通过 Worker 的加密运行时变量 `ADMIN_TOKEN`、`SESSION_SECRET` 提供。

1. 在合并前核对目标 D1 的待执行迁移。对本次发布新增的迁移，使用有权限的 Cloudflare 身份应用并回读。命令按数据库名称定位目标。 [Cloudflare D1 迁移](https://developers.cloudflare.com/d1/reference/migrations/)
   ```bash
   npx wrangler d1 migrations list dams-meetup-15 --remote
   npx wrangler d1 migrations apply dams-meetup-15 --remote
   npx wrangler d1 migrations list dams-meetup-15 --remote
   npx wrangler d1 execute dams-meetup-15 --remote \
     --command 'SELECT name FROM d1_migrations ORDER BY id; SELECT id, admission_open, revision FROM activity_state WHERE id = 1;'
   ```
   最后一次列表应显示没有待执行迁移，查询应返回对应的迁移记录及活动状态。活动开始前确认 `admission_open=0`。也可在同一个 D1 的 Cloudflare Console 执行只读回查。
2. GitHub 检查通过后合并到 `main`，等待 Workers Builds 自动部署。部署列表应显示合并提交对应的 Worker 版本承接生产流量。自动发布不可用时，在确认同样的 D1 前置条件后从目标提交运行 `npm run deploy`。
3. 在生产域名打开 `/agenda` 和 `/admin`，验证议程可公开浏览，并核对入场开关符合现场状态。

第 14 期的 Supabase、旧凭据及重置流程保留在 [第 14 期上线手册归档](./next-event-bootstrap.md)。
