// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore OpenNext 生成此入口，干净的检出目录没有构建产物。
import next from '../.open-next/worker.js'
import { handleActivityRequest, type ActivityEnv } from './activity'

import { handleMeetupAccess } from './meetup-access'
import { handleDiscussion } from './meetup-discussion'
import { handleProjection } from './meetup-projection'
import { handlePersonal } from './meetup-personal'
import { handleRaffle } from './meetup-raffle'
import { handleMeetupSummary } from './meetup-summary'
import { meetupNow } from '../src/lib/meetup15/event'

export { ActivityUpdates } from './activity'

const worker = {
  fetch(request: Request, env: ActivityEnv, context: ExecutionContext) {
    const { pathname } = new URL(request.url)
    const clock = () => meetupNow(env)
    if (pathname === '/api/activity' || pathname === '/api/activity/updates' ||
        pathname === '/api/activity/session' || pathname === '/api/activity/stats') {
      return handleActivityRequest(request, env, clock())
    }
    if (pathname === '/api/admin/meetup-summary') return handleMeetupSummary(request, env, clock())
    if (pathname.startsWith('/api/meetup/')) return handleMeetupAccess(request, env, clock)
    if (pathname === '/api/raffle') return handleRaffle(request, env, clock)
    if (pathname === '/api/personal' || pathname.startsWith('/api/personal/')) return handlePersonal(request, env, clock)
    if (pathname === '/api/discussion' || pathname.startsWith('/api/discussion/')) {
      return handleDiscussion(request, env, clock, context)
    }
    if (pathname === '/api/polls' || pathname.startsWith('/api/polls/')) return new Response(null, { status: 404 })
    if (pathname === '/api/screen' || pathname.startsWith('/api/screen/')) return handleProjection(request, env, clock)
    return next.fetch(request, env, context)
  },
}

export default worker
