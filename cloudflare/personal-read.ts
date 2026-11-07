import type { Member } from '../src/lib/meetup15/identity'
import type { MemberCard, Message, PersonalItem, PersonalSnapshot, ThreadSnapshot, ThreadSummary } from '../src/lib/meetup15/personal'

const REPLY_TO_VIEWER = `r.kind = 'reply' AND EXISTS (
  SELECT 1 FROM meetup15_discussion parent
  WHERE parent.id = COALESCE(r.parent_reply_id, r.post_id) AND parent.author_id = ? AND parent.author_id <> r.author_id
)`

export function repliesRead(db: D1Database, memberId: string, through: number) {
  return db.prepare(`
    UPDATE meetup15_members SET replies_seen_through = MAX(replies_seen_through, COALESCE((
      SELECT MAX(r.id) FROM meetup15_discussion r WHERE ${REPLY_TO_VIEWER} AND r.id <= ?
    ), 0)) WHERE id = ?
  `).bind(memberId, through, memberId)
}

export async function personalOverview(db: D1Database, member: Member): Promise<PersonalSnapshot> {
  const [profile, posts, replies, threads] = await db.batch([
    db.prepare(`
      SELECT display_name AS nickname, contact, contact_public AS contactPublic, profile_revision AS profileRevision
      FROM meetup15_members WHERE id = ?
    `).bind(member.id),
    db.prepare(`
      SELECT id, section, body, '' AS author, 0 AS unread FROM meetup15_discussion
      WHERE kind = 'post' AND author_id = ? ORDER BY id DESC LIMIT 50
    `).bind(member.id),
    db.prepare(`
      SELECT r.id, r.section, r.body, COALESCE(sender.display_name, '现场观众') AS author,
        r.id > viewer.replies_seen_through AS unread
      FROM meetup15_discussion r JOIN meetup15_members sender ON sender.id = r.author_id
      JOIN meetup15_members viewer ON viewer.id = ?
      WHERE ${REPLY_TO_VIEWER} ORDER BY r.id DESC LIMIT 50
    `).bind(member.id, member.id),
    db.prepare(`
      SELECT t.id, other.id AS contactId, t.member_b IS NULL AS system,
        CASE WHEN t.member_b IS NULL THEN '主办方通知' ELSE COALESCE(other.display_name, '现场观众') END AS name,
        last.body, last.id AS latestId, EXISTS(SELECT 1 FROM meetup15_dm_messages m
          WHERE m.thread_id = t.id AND m.sender_id IS NOT ? AND m.id > MAX(COALESCE(v.read_through, 0), COALESCE(v.hidden_through, 0))) AS unread
      FROM meetup15_dm_threads t
      LEFT JOIN meetup15_members other ON other.id = CASE WHEN t.member_a = ? THEN t.member_b ELSE t.member_a END
      LEFT JOIN meetup15_dm_views v ON v.thread_id = t.id AND v.member_id = ?
      JOIN meetup15_dm_messages last ON last.id = (
        SELECT MAX(id) FROM meetup15_dm_messages WHERE thread_id = t.id AND id > COALESCE(v.hidden_through, 0)
      )
      WHERE t.member_a = ? OR t.member_b = ? ORDER BY last.id DESC
    `).bind(member.id, member.id, member.id, member.id, member.id),
  ])
  const own = profile.results[0] as Pick<PersonalSnapshot, 'nickname' | 'contact' | 'contactPublic' | 'profileRevision'>
  return {
    ...own, contactPublic: Boolean(own.contactPublic),
    posts: posts.results as PersonalItem[], replies: replies.results as PersonalItem[],
    threads: threads.results as ThreadSummary[], refreshAt: null,
  }
}

export function memberCard(db: D1Database, member: Member, targetId: string) {
  return db.prepare(`
    SELECT COALESCE(display_name, '现场观众') AS name,
      CASE WHEN contact_public = 1 OR id = ? THEN contact END AS contact
    FROM meetup15_members WHERE id = ?
  `).bind(member.id, targetId).first<Omit<MemberCard, 'named' | 'refreshAt'>>()
}

export function threadForMember(db: D1Database, memberId: string, id: number) {
  return db.prepare(`
    SELECT t.id, t.member_b IS NULL AS system,
      CASE WHEN t.member_b IS NULL THEN NULL WHEN t.member_a = ? THEN t.member_b ELSE t.member_a END AS peer,
      CASE WHEN t.member_b IS NULL THEN '主办方通知' ELSE COALESCE(other.display_name, '现场观众') END AS name
    FROM meetup15_dm_threads t
    LEFT JOIN meetup15_members other ON other.id = CASE WHEN t.member_a = ? THEN t.member_b ELSE t.member_a END
    WHERE t.id = ? AND (t.member_a = ? OR t.member_b = ?)
  `).bind(memberId, memberId, id, memberId, memberId)
    .first<{ id: number; system: number; peer: string | null; name: string }>()
}

export async function readThread(db: D1Database, member: Member, thread: { id: number; system: number; name: string }, before: number): Promise<ThreadSnapshot> {
  const { results } = await db.prepare(`
    SELECT m.id, m.body, COALESCE(m.sender_id = ?, 0) AS mine,
      m.sender_id IS NOT ? AND m.id > COALESCE(v.read_through, 0) AS unread
    FROM meetup15_dm_messages m
    LEFT JOIN meetup15_dm_views v ON v.thread_id = m.thread_id AND v.member_id = ?
    WHERE m.thread_id = ? AND m.id > COALESCE(v.hidden_through, 0) AND m.id < ?
    ORDER BY m.id DESC LIMIT 51
  `).bind(member.id, member.id, member.id, thread.id, before).all<Message>()
  const messages = results.slice(0, 50)
  return { name: thread.name, named: Boolean(member.display_name), system: Boolean(thread.system),
    messages: messages.reverse(), nextBefore: results.length > 50 ? messages[0].id : null, refreshAt: null }
}
