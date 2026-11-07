import {
  ADMISSION_END, isMeetupSection, meetupAgendaAt, meetupSectionAt,
  nextMeetupAgendaChange, nextMeetupSectionChange,
} from '../src/lib/meetup15/event'
import type { Member } from '../src/lib/meetup15/identity'
import type { LotteryScreen, Poll, PollAdminSnapshot, PollFeedSnapshot, ScreenSnapshot } from '../src/lib/meetup15/polls'
import { readStaff } from './discussion-read'

type Settings = {
  section_override: string | null
  screen_mode: 'intro' | 'live'
  screen_poll_section: Poll['section'] | null
  reveal_poll_id: number | null
  screen_lottery: string | null
}

type PollRow = Omit<Poll, 'mine' | 'multiple' | 'hidden' | 'closed' | 'options' | 'counts' | 'ballot'> & {
  mine: number
  multiple: number
  hidden: number
  closed: number
  options: string
  counts: string | null
  ballot: string | null
}

function readSettings(db: D1Database) {
  return db.prepare(`
    SELECT section_override, screen_mode, screen_poll_section, reveal_poll_id, screen_lottery
    FROM activity_state WHERE id = 1`
  ).first<Settings>()
}

function sectionContext(settings: Settings | null, now: number) {
  const override = settings?.section_override
  return isMeetupSection(override)
    ? { section: override, refreshAt: null }
    : { section: meetupSectionAt(now), refreshAt: nextMeetupSectionChange(now) }
}

async function readPolls(
  db: D1Database,
  now: number,
  view: 'phone' | 'carousel' | 'reveal',
  section: Poll['section'] | null,
  viewer: string | null,
  id: number | null = null,
): Promise<Poll[]> {
  const { results } = await db.prepare(`
    WITH visible AS (
      SELECT p.*, m.display_name AS author, COALESCE(p.author_id = ?1, 0) AS mine,
        (p.closed_at IS NOT NULL OR p.deadline <= ?2) AS closed, b.choices AS ballot
      FROM meetup15_polls p JOIN meetup15_members m ON m.id = p.author_id
      LEFT JOIN meetup15_ballots b ON b.poll_id = p.id AND b.member_id = ?1
      WHERE (?3 = 'phone' AND p.section = ?4)
         OR (?3 = 'carousel' AND p.section = ?4 AND p.closed_at IS NULL AND p.deadline > ?2)
         OR (?3 = 'reveal' AND p.id = ?5 AND p.hidden = 1 AND (p.closed_at IS NOT NULL OR p.deadline <= ?2))
    )
    SELECT id, title, section, author, mine, multiple, hidden, deadline, closed, options, ballot,
      (SELECT COUNT(*) FROM meetup15_ballots WHERE poll_id = visible.id) AS voters,
      CASE WHEN hidden = 0 OR ?3 = 'reveal' OR (?3 = 'phone' AND (closed = 1 OR ballot IS NOT NULL))
      THEN (
        SELECT json_group_object(choice, votes) FROM (
          SELECT j.value AS choice, COUNT(*) AS votes
          FROM meetup15_ballots b, json_each(b.choices) j
          WHERE b.poll_id = visible.id GROUP BY j.value
        )
      ) ELSE NULL END AS counts
    FROM visible ORDER BY id DESC`
  ).bind(viewer, Math.floor(now / 1000), view, section, id).all<PollRow>()

  return results.map((row) => {
    const options: string[] = JSON.parse(row.options)
    const tally: Record<string, number> | null = row.counts === null ? null : JSON.parse(row.counts)
    return { ...row, options, ballot: row.ballot ? JSON.parse(row.ballot) : [],
      counts: tally ? options.map((_, index) => tally[index] ?? 0) : null,
      mine: Boolean(row.mine), multiple: Boolean(row.multiple), hidden: Boolean(row.hidden),
      closed: Boolean(row.closed) }
  })
}

function earliest(...boundaries: (number | null)[]) {
  const next = Math.min(...boundaries.filter((time) => time !== null))
  return Number.isFinite(next) ? next : null
}

function nextPollDeadline(polls: Poll[]) {
  return earliest(...polls.filter((poll) => !poll.closed).map((poll) => poll.deadline * 1000))
}

export async function readPollFeed(
  db: D1Database, member: Member, url: URL, now: number,
): Promise<PollFeedSnapshot> {
  const context = sectionContext(await readSettings(db), now)
  const wanted = url.searchParams.get('section')
  const section = isMeetupSection(wanted) ? wanted : context.section
  const polls = await readPolls(db, now, 'phone', section, member.id)
  return {
    polls,
    canCreate: member.role === 'guest' && now < ADMISSION_END,
    canVote: member.role === 'attendee',
    refreshAt: earliest(context.refreshAt, nextPollDeadline(polls), now < ADMISSION_END ? ADMISSION_END : null),
  }
}

export async function readPollAdmin(db: D1Database, now: number): Promise<PollAdminSnapshot> {
  const settings = await readSettings(db)
  const { results } = await db.prepare(`
    SELECT id, title, section FROM meetup15_polls
    WHERE hidden = 1 AND (closed_at IS NOT NULL OR deadline <= ?) ORDER BY id DESC`
  ).bind(Math.floor(now / 1000)).all<PollAdminSnapshot['revealable'][number]>()
  const deadline = await db.prepare(`
    SELECT MIN(deadline) AS next FROM meetup15_polls
    WHERE hidden = 1 AND closed_at IS NULL AND deadline > ?`
  ).bind(Math.floor(now / 1000)).first<number>('next')
  return {
    mode: settings?.screen_mode ?? 'live',
    filter: settings?.screen_poll_section ?? null,
    revealed: settings?.reveal_poll_id ?? null,
    revealable: results,
    refreshAt: deadline === null ? null : deadline * 1000,
  }
}

function lotteryState(raw: string | null | undefined): LotteryScreen | null {
  if (!raw) return null
  try {
    const state = JSON.parse(raw) as LotteryScreen | null
    if (state?.phase === 'drawing') return { phase: 'drawing' }
    if (state?.phase === 'winner' && typeof state.winner === 'string' && state.winner.trim()) {
      return { phase: 'winner', winner: state.winner }
    }
  } catch {
    return null
  }
  return null
}

export async function readPollScreen(db: D1Database, now: number): Promise<ScreenSnapshot> {
  const [settings, online] = await Promise.all([
    readSettings(db),
    db.prepare('SELECT COUNT(*) AS total FROM meetup15_members WHERE last_seen_at > ?')
      .bind(Math.floor(now / 1000) - 120).first<number>('total'),
  ])
  const context = sectionContext(settings, now)
  const base = {
    online: online ?? 0,
    agenda: meetupAgendaAt(now)?.title ?? (now < ADMISSION_END ? '活动尚未开始' : '活动已结束'),
    refreshAt: earliest(context.refreshAt, nextMeetupAgendaChange(now)),
  }
  if (settings?.reveal_poll_id != null) {
    const [poll] = await readPolls(db, now, 'reveal', null, null, settings.reveal_poll_id)
    if (poll) return { ...base, mode: 'reveal', poll }
  }
  if (settings?.screen_mode === 'intro') return { ...base, mode: 'intro' }
  const lottery = lotteryState(settings?.screen_lottery)
  if (lottery) return { ...base, mode: 'lottery', lottery }
  const staff = await readStaff(db, now, 'screen')
  if (staff.activeRound) return { ...base, mode: 'qa', round: staff.activeRound, questions: staff.questions }
  const polls = await readPolls(db, now, 'carousel', settings?.screen_poll_section ?? context.section, null)
  return { ...base, mode: 'live', polls, refreshAt: earliest(base.refreshAt, nextPollDeadline(polls)) }
}
