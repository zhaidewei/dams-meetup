const memberColors = [
  'bg-sky-100 text-sky-950',
  'bg-emerald-100 text-emerald-950',
  'bg-rose-100 text-rose-950',
  'bg-violet-100 text-violet-950',
  'bg-amber-100 text-amber-950',
  'bg-cyan-100 text-cyan-950',
] as const

function memberColor(id: string) {
  let hash = 2166136261
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return memberColors[(hash >>> 0) % memberColors.length]
}

export function MemberAvatar({ id, name, className }: { id: string | null; name: string; className: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-semibold ${className} ${id === null
      ? 'bg-sky-100 text-sky-950' : memberColor(id)}`}>
      {Array.from(name)[0]}
    </span>
  )
}
