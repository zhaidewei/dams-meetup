import { describe, expect, it } from 'vitest'
import {
  aggregateProfiles,
  buildPrompt,
  type CandidatePost,
  type RawPostWithUser,
  type UserProfile,
} from './prompt'

const baseUser = {
  is_vip: false,
  vip_name: null,
  vip_title: null,
  company: null,
}

describe('aggregateProfiles — match_offer 透传', () => {
  it('从 users.match_offer 复制到 profile.match_offer', () => {
    const rows: RawPostWithUser[] = [
      {
        user_id: 'u1',
        body: 'hello',
        tags: null,
        section: null,
        users: {
          ...baseUser,
          id: 'u1',
          nickname: 'alice',
          match_offer: '我在 Booking 做过 SRE 5 年',
        },
      },
    ]
    const profiles = aggregateProfiles(rows)
    expect(profiles).toHaveLength(1)
    expect(profiles[0].match_offer).toBe('我在 Booking 做过 SRE 5 年')
  })

  it('match_offer 为 null 时 profile 也是 null', () => {
    const rows: RawPostWithUser[] = [
      {
        user_id: 'u1',
        body: 'hello',
        tags: null,
        section: null,
        users: { ...baseUser, id: 'u1', nickname: 'alice', match_offer: null },
      },
    ]
    expect(aggregateProfiles(rows)[0].match_offer).toBeNull()
  })

  it('同一用户多帖时 match_offer 取首次出现值（per-user 字段）', () => {
    const rows: RawPostWithUser[] = [
      {
        user_id: 'u1',
        body: 'post 1',
        tags: null,
        section: null,
        users: { ...baseUser, id: 'u1', nickname: 'alice', match_offer: 'first' },
      },
      {
        user_id: 'u1',
        body: 'post 2',
        tags: null,
        section: null,
        users: { ...baseUser, id: 'u1', nickname: 'alice', match_offer: 'second' },
      },
    ]
    const profiles = aggregateProfiles(rows)
    expect(profiles).toHaveLength(1)
    expect(profiles[0].match_offer).toBe('first')
    expect(profiles[0].posts).toHaveLength(2)
  })
})

describe('buildPrompt — match_offer 渲染', () => {
  const candidate: CandidatePost = {
    id: 1,
    body: '想找 Booking 内推',
    tags: null,
    section: null,
    user_id: 'u-asker',
    match_intent: '希望找有内推名额的同学',
  }

  function makeProfile(match_offer: string | null): UserProfile {
    return {
      user_id: 'u1',
      display_name: 'alice',
      affiliation: null,
      match_offer,
      posts: [{ body: '昨天的演讲不错', tags: null, section: null }],
    }
  }

  it('match_offer 非空时 prompt 含独立"自我介绍"段落', () => {
    const prompt = buildPrompt({
      candidates: [candidate],
      profiles: [makeProfile('我在 Booking 做过 SRE 5 年')],
    })
    expect(prompt).toMatch(/自我介绍.*用户私下委托.*Booking.*SRE/)
  })

  it('match_offer 为 null 时 prompt 不出现"自我介绍"段落', () => {
    const prompt = buildPrompt({
      candidates: [candidate],
      profiles: [makeProfile(null)],
    })
    expect(prompt).not.toMatch(/自我介绍/)
  })

  it('match_offer 里的邮箱被 redactContacts 兜底', () => {
    const prompt = buildPrompt({
      candidates: [candidate],
      profiles: [makeProfile('email me at alice@example.com')],
    })
    expect(prompt).not.toMatch(/alice@example\.com/)
    expect(prompt).toMatch(/\[已隐藏\]/)
  })

  it('match_offer 里的长数字串（手机号）被 redactContacts 兜底', () => {
    const prompt = buildPrompt({
      candidates: [candidate],
      profiles: [makeProfile('call 13800138000 if interested')],
    })
    expect(prompt).not.toMatch(/13800138000/)
    expect(prompt).toMatch(/\[已隐藏\]/)
  })
})
