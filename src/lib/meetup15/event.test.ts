import { expect, it } from 'vitest'
import { ADMISSION_END, MEETUP_AGENDA, meetupSectionAt, nextMeetupSectionChange } from './event'

it('uses the public agenda boundaries to switch discussion sections in Amsterdam time', () => {
  const cases = [
    ['12:45:00', 'lounge'],
    ['13:29:59', 'lounge'],
    ['13:30:00', 'lightning'],
    ['14:30:00', 'expert'],
    ['15:00:00', 'breakout'],
    ['16:30:00', 'panel'],
    ['17:30:00', 'lounge'],
    ['18:00:00', 'lounge'],
  ] as const

  expect(MEETUP_AGENDA).toHaveLength(7)
  for (const [localTime, expected] of cases) {
    expect(meetupSectionAt(Date.parse(`2026-11-14T${localTime}+01:00`))).toBe(expected)
  }
  expect(nextMeetupSectionChange(Date.parse('2026-11-14T12:45:00+01:00')))
    .toBe(Date.parse('2026-11-14T13:30:00+01:00'))
  expect(nextMeetupSectionChange(Date.parse('2026-11-14T17:30:00+01:00'))).toBeNull()
  expect(ADMISSION_END).toBe(Date.parse('2026-11-14T17:00:00Z'))
})
