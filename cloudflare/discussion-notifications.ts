import type { ActivityEnv } from './activity'

export async function notifyDiscussion(env: ActivityEnv, update: 'qa' | 'all' = 'all') {
  const enqueue = () => env.ACTIVITY_UPDATES.getByName('meetup-15-discussion').queueDiscussionUpdate(update)
  try {
    await enqueue()
  } catch {
    try {
      await enqueue()
    } catch (error) {
      console.error('Discussion update notification failed', error)
    }
  }
}
