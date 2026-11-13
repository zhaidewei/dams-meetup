import { Volume2, VolumeX } from 'lucide-react'
import type { ProjectionView } from '@/lib/meetup15/projection'
import { MEETUP_NAME } from '@/lib/meetup15/event'
import { RAFFLE_ACTIVE_HOURS, RAFFLE_WEIGHT_RULE, type RaffleCandidateView } from '@/lib/meetup15/raffle'
import { useRaffleAnimation } from './useRaffleAnimation'

const CELL_WIDTH = 88
const CELL_HEIGHT = 80
const MAX_RADIUS = 26
const probability = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 2 })

function RafflePool({ candidates, showCount, activeIndex }: {
  candidates: RaffleCandidateView[]; showCount: boolean; activeIndex?: number | null
}) {
  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
  const maxWeight = Math.max(...candidates.map(candidate => candidate.weight))
  const columns = Math.min(candidates.length, Math.ceil(Math.sqrt(candidates.length * 1.4)))
  const rows = Math.ceil(candidates.length / columns)
  const width = columns * CELL_WIDTH
  return (
    <figure className="flex min-h-0 flex-col gap-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-600">
        <span className="text-lg font-semibold text-slate-900">奖池{showCount && ` · ${candidates.length} 位候选人`}</span>
        <span>圆圈面积代表中奖概率</span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${rows * CELL_HEIGHT}`} className="mx-auto block w-full md:max-h-[70svh]"
        style={{ maxWidth: width * 2.2 }} role="group" aria-label="本轮完整奖池">
        {candidates.map(({ name, weight, won }, index) => {
          const percent = probability.format(weight / totalWeight)
          const characters = Array.from(name)
          const label = characters.length > 8 ? [...characters.slice(0, 7), '…'] : characters
          const lineLength = label.length > 4 ? Math.ceil(label.length / 2) : label.length
          const firstLine = label.slice(0, lineLength).join('')
          const secondLine = label.slice(lineLength).join('')
          const radius = MAX_RADIUS * Math.sqrt(weight / maxWeight)
          const fontSize = Math.min(11, radius * 1.62 / Math.max(1, lineLength))
          const row = Math.floor(index / columns)
          const rowSize = Math.min(columns, candidates.length - row * columns)
          const x = ((index % columns) + (columns - rowSize + 1) / 2) * CELL_WIDTH
          const y = row * CELL_HEIGHT + 29
          return (
            <g key={index} role="img" aria-label={`${name} · ${percent}${won ? ' · 中奖' : ''}`}>
              <title>{name} · {percent}{won ? ' · 中奖' : ''}</title>
              <circle cx={x} cy={y} r={radius}
                className={won ? 'fill-dams-orange-wash stroke-dams-orange-strong' : 'fill-blue-50 stroke-blue-300'}
                strokeWidth={won ? 2 : 1.2} />
              {activeIndex === index && (
                <circle data-raffle-highlight aria-hidden cx={x} cy={y} r={radius + 3}
                  className="fill-blue-400/20 stroke-dams-blue motion-reduce:hidden" strokeWidth={2.5} />
              )}
              <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={fontSize}
                className={won ? 'fill-dams-ink font-bold' : 'fill-slate-900 font-semibold'}>
                <tspan x={x} y={secondLine ? y - fontSize * 0.55 : y}>{firstLine}</tspan>
                {secondLine && <tspan x={x} y={y + fontSize * 0.55}>{secondLine}</tspan>}
              </text>
              <text x={x} y={y + radius + 14} textAnchor="middle"
                className={won ? 'fill-dams-ink text-[11px] font-bold' : 'fill-slate-600 text-[11px]'}>{percent}</text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

export function RaffleScreen({ data, muted }: { data: Extract<ProjectionView, { mode: 'raffle' }>; muted: boolean }) {
  const { lottery, candidates, raffleId, rules } = data
  const { drawingFrame, soundEnabled, soundError, toggleSound } = useRaffleAnimation(raffleId, lottery, candidates.length)
  return (
    <section aria-label="现场抽奖" className="bg-white text-left text-dams-ink min-h-svh px-[clamp(1rem,4vw,4.5rem)] py-[clamp(1.25rem,5vh,4rem)]">
      <div className="mx-auto grid min-h-[88svh] max-w-[100rem] items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2.35fr)] xl:gap-14">
        <div className="space-y-7">
          <header className="space-y-3">
            <p className="text-sm font-medium text-dams-blue">{MEETUP_NAME}</p>
            <h1 className="text-[clamp(2.25rem,5vw,5.25rem)] leading-tight font-bold tracking-tight text-dams-blue">现场抽奖</h1>
            {raffleId !== null && <p className="text-sm font-medium text-slate-600">第 {raffleId} 轮</p>}
            <div role="status" className="pt-1 text-lg">
              {lottery?.phase === 'winner' && (
                <p className="font-bold wrap-anywhere text-dams-orange-strong text-[clamp(1.75rem,3.5vw,3.75rem)] leading-tight">
                  <span className="block text-base">{'恭喜 '}</span>{lottery.winner}！
                </p>
              )}
              {lottery?.phase === 'drawing' && <p>抽奖进行中 · {lottery.candidateCount} 位候选人</p>}
              {lottery?.phase === 'empty' && <p>本轮没有符合条件的候选人。</p>}
              {!lottery && <p>等待主持人开启抽奖</p>}
            </div>
            {lottery?.phase === 'drawing' && (
              <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-dams-selection">
                <div className="h-full rounded-full bg-dams-blue motion-safe:transition-[width] motion-safe:duration-150"
                  style={{ width: `${(drawingFrame?.progress ?? 0) * 100}%` }} />
              </div>
            )}
            {!muted && (
              <button type="button" onClick={() => void toggleSound()}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dams-line bg-white px-3 text-sm font-medium text-dams-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dams-blue">
                {soundEnabled ? <Volume2 aria-hidden size={16} /> : <VolumeX aria-hidden size={16} />}
                {soundEnabled ? '关闭声音' : '开启声音'}
              </button>
            )}
            {!muted && soundError && <p role="status" className="text-sm text-slate-600">暂时无法开启声音，请重试。</p>}
          </header>
          <section aria-labelledby="raffle-rules-title" className="space-y-2 border-t border-dams-line pt-3 leading-relaxed text-slate-600 text-base">
            <h2 id="raffle-rules-title" className="font-semibold text-slate-900">抽奖规则</h2>
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
        {candidates.length > 0 ? (
          <div className="min-w-0 rounded-2xl border border-dams-line bg-white p-[clamp(1rem,2.5vw,2rem)]">
            <RafflePool candidates={candidates} showCount={lottery?.phase !== 'drawing'} activeIndex={drawingFrame?.index} />
          </div>
        ) : lottery?.phase !== 'drawing' && (
          <p className="rounded-2xl border border-dams-line bg-white p-8 text-center text-lg text-slate-600">
            暂无候选人
          </p>
        )}
      </div>
    </section>
  )
}
