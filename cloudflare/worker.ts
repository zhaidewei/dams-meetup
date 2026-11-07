// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore OpenNext 生成此入口，干净的检出目录没有构建产物。
import next from '../.open-next/worker.js'
import { handleActivityRequest, type ActivityEnv } from './activity'

export { ActivityUpdates } from './activity'

const worker = {
  fetch(request: Request, env: ActivityEnv, context: ExecutionContext) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/activity' || pathname === '/api/activity/updates' ||
        pathname === '/api/activity/session') {
      return handleActivityRequest(request, env)
    }
    return next.fetch(request, env, context)
  },
}

export default worker
