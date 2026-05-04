import {
  SECTION_META,
  sectionLabel,
  sectionTimeRange,
  type SectionId,
} from '@/lib/sections'

type Props = {
  section: SectionId
}

// SectionTabs 下方一行小字：「演讲 1 · 13:30–14:30 · 刘爵铭 · 和 AI 搭档」
// (issue #18 C)。给用户当前板块的具体上下文，省得切到 /agenda 才知道这场讲什么。
export function SectionContextBar({ section }: Props) {
  const meta = SECTION_META[section]
  const range = sectionTimeRange(section)
  const parts: string[] = [sectionLabel(section)]
  if (range) parts.push(range)
  if (meta.speaker) parts.push(meta.speaker)
  parts.push(meta.topic)

  return (
    <p className="mt-2 px-1 text-xs leading-relaxed text-zinc-500">
      {parts.join(' · ')}
      {meta.affiliation && (
        <span className="text-zinc-400"> — {meta.affiliation}</span>
      )}
    </p>
  )
}
