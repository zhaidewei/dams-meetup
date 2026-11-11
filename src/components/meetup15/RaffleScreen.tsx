import type { ProjectionView } from '@/lib/meetup15/projection'
import { RAFFLE_ACTIVE_HOURS, RAFFLE_WEIGHT_RULE, type RaffleCandidateView } from '@/lib/meetup15/raffle'

const CELL_WIDTH = 88
const CELL_HEIGHT = 80
const MAX_RADIUS = 26
const probability = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 2 })

function RafflePool({ candidates }: { candidates: RaffleCandidateView[] }) {
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
  const maxWeight = Math.max(...candidates.map(candidate => candidate.weight))
  const columns = Math.min(candidates.length, Math.ceil(Math.sqrt(candidates.length * 2)))
  const rows = Math.ceil(candidates.length / columns)
  const width = columns * CELL_WIDTH
  return (
    <figure className="projection-raffle-pool">
      <figcaption className="projection-votes text-sky-100">
        {candidates.length} 位候选人 · 圆圈面积代表中奖概率
      </figcaption>
      <svg viewBox={`0 0 ${width} ${rows * CELL_HEIGHT}`} className="projection-raffle-map" style={{ width: `min(100%, ${columns * 9}cqi)` }}
        role="group" aria-label="本轮完整奖池">
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
                className={won ? 'fill-amber-300/25 stroke-amber-200' : 'fill-sky-400/15 stroke-sky-300/70'}
                strokeWidth={won ? 2 : 1} />
              <text x={x} y={y} dy=".35em" textAnchor="middle" className="fill-white text-[10px]">{percent}</text>
              <text x={x} y={y + 43} textAnchor="middle"
                className={won ? 'fill-amber-100 text-[12px] font-semibold' : 'fill-sky-50 text-[12px]'}>{label}</text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

export function RaffleScreen({ data }: { data: Extract<ProjectionView, { mode: 'raffle' }> }) {
  const { lottery, candidates, raffleId, rules } = data
  return (
    <section aria-label="现场抽奖" className="projection-raffle overflow-hidden rounded-2xl bg-[radial-gradient(ellipse_at_top,#1e40af,#1e293b_75%)] text-white">
      <div className="projection-raffle-intro">
        <div className="projection-raffle-header">
          <h1 className="projection-title">现场抽奖</h1>
          {raffleId !== null && <p className="projection-votes text-sky-100">第 {raffleId} 轮</p>}
          {lottery?.phase === 'winner' && (
            <p className="projection-winner wrap-anywhere text-amber-200">恭喜 {lottery.winner}！</p>
          )}
          {lottery?.phase === 'drawing' && (
            <p className="motion-safe:animate-pulse">抽奖进行中 · {lottery.candidateCount} 位候选人</p>
          )}
          {lottery?.phase === 'empty' && <p>本轮没有符合条件的候选人。</p>}
          {!lottery && <p>等待主持人开启抽奖</p>}
        </div>
        <section aria-labelledby="raffle-rules-title" className="projection-raffle-rules bg-black/25 text-sky-50">
          <h2 id="raffle-rules-title" className="font-semibold text-white">抽奖规则</h2>
          <p>最近 {RAFFLE_ACTIVE_HOURS} 小时内活跃的观众可参加。嘉宾和本场已中奖者除外，每轮最多抽出 1 人。</p>
          {rules ? (
            <>
              <p>{rules.requireParticipation ? '本轮要求至少发过一次帖或回复。' : '本轮无发帖或回复要求。'}</p>
              <p>{rules.weighted ? `按互动加权。 ${RAFFLE_WEIGHT_RULE}` : '等概率抽取。每位候选人的中奖概率相同。'}</p>
            </>
          ) : (
            <p>{raffleId === null ? '参与门槛和抽取方式由主持人设定。' : '该轮未记录参与门槛与抽取方式。'}</p>
          )}
        </section>
      </div>
      {candidates.length > 0 && <RafflePool candidates={candidates} />}
    </section>
  )
}
