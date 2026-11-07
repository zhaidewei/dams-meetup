import type { ProjectionView } from '@/lib/meetup15/projection'
import type { RaffleCandidateView } from '@/lib/meetup15/raffle'

const CELL_WIDTH = 88
const CELL_HEIGHT = 80
const MAX_RADIUS = 26
const probability = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 2 })

function RafflePool({ candidates }: { candidates: RaffleCandidateView[] }) {
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
  const maxWeight = Math.max(...candidates.map(candidate => candidate.weight))
  const columns = Math.min(candidates.length, Math.ceil(Math.sqrt(candidates.length * 3)))
  const rows = Math.ceil(candidates.length / columns)
  const width = columns * CELL_WIDTH
  return (
    <figure className="space-y-2 px-2 pb-3">
      <figcaption className="text-xs text-teal-100">
        {candidates.length} 位候选人 · 圆圈面积代表中奖概率
      </figcaption>
      <svg viewBox={`0 0 ${width} ${rows * CELL_HEIGHT}`} className="mx-auto block w-full"
        style={{ maxWidth: width }} role="group" aria-label="本轮完整奖池">
        {candidates.map(({ name, weight, won }, index) => {
          const percent = probability.format(weight / totalWeight)
          const characters = Array.from(name)
          const label = characters.length > 7 ? characters.slice(0, 6).join('') + '…' : name
          const row = Math.floor(index / columns)
          const rowSize = Math.min(columns, candidates.length - row * columns)
          const x = ((index % columns) + (columns - rowSize + 1) / 2) * CELL_WIDTH
          const y = row * CELL_HEIGHT + 29
          return (
            <g key={index} role="img" aria-label={`${name} · ${percent}${won ? ' · 中奖' : ''}`}>
              <title>{name} · {percent}{won ? ' · 中奖' : ''}</title>
              <circle cx={x} cy={y} r={MAX_RADIUS * Math.sqrt(weight / maxWeight)}
                className={won ? 'fill-amber-300/25 stroke-amber-200' : 'fill-teal-400/15 stroke-teal-300/70'}
                strokeWidth={won ? 2 : 1} />
              <text x={x} y={y} dy=".35em" textAnchor="middle" className="fill-white text-[10px]">{percent}</text>
              <text x={x} y={y + 43} textAnchor="middle"
                className={won ? 'fill-amber-100 text-[12px] font-semibold' : 'fill-teal-50 text-[12px]'}>{label}</text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

export function RaffleScreen({ data, compact }: { data: Extract<ProjectionView, { mode: 'raffle' }>; compact: boolean }) {
  const { lottery, candidates, raffleId } = data
  return (
    <section aria-label="现场抽奖" className="overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_top,#17473f,#061713_75%)]">
      <div className={compact ? 'space-y-2 p-3' : 'space-y-3 px-4 py-6'}>
        <h1 className={compact ? 'text-lg font-semibold' : 'text-3xl font-semibold md:text-5xl'}>现场抽奖</h1>
        {raffleId !== null && <p className="text-sm text-teal-100">第 {raffleId} 轮</p>}
        {lottery?.phase === 'winner' && (
          <p className={`wrap-anywhere font-semibold text-amber-200 ${compact ? 'text-lg' : 'text-3xl md:text-5xl'}`}>
            恭喜 {lottery.winner}！
          </p>
        )}
        {lottery?.phase === 'drawing' && (
          <p className="motion-safe:animate-pulse">抽奖进行中 · {lottery.candidateCount} 位候选人</p>
        )}
        {lottery?.phase === 'empty' && <p>本轮没有符合条件的候选人。</p>}
        {!lottery && <p>等待主持人开启抽奖</p>}
      </div>
      {candidates.length > 0 && <RafflePool candidates={candidates} />}
    </section>
  )
}
