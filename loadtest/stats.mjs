// Lightweight counter + histogram. p50/p95/p99 via streaming sample reservoir
// (size 1024 — sufficient for ballpark; not exact for high-volume metrics but
// good enough to spot outliers).

export class Stats {
  constructor() {
    this.counters = new Map()
    this.samples = new Map() // key -> Float64Array reservoir
    this.sampleCount = new Map() // key -> total samples seen (for reservoir replacement)
  }

  inc(key, by = 1) {
    this.counters.set(key, (this.counters.get(key) ?? 0) + by)
  }

  get(key) { return this.counters.get(key) ?? 0 }

  observe(key, value) {
    const RESERVOIR = 1024
    let arr = this.samples.get(key)
    let count = this.sampleCount.get(key) ?? 0
    if (!arr) {
      arr = new Float64Array(RESERVOIR)
      this.samples.set(key, arr)
    }
    if (count < RESERVOIR) {
      arr[count] = value
    } else {
      const j = Math.floor(Math.random() * (count + 1))
      if (j < RESERVOIR) arr[j] = value
    }
    this.sampleCount.set(key, count + 1)
  }

  percentiles(key) {
    const arr = this.samples.get(key)
    const count = this.sampleCount.get(key) ?? 0
    if (!arr || count === 0) return null
    const n = Math.min(count, arr.length)
    const slice = Array.from(arr.subarray(0, n)).sort((a, b) => a - b)
    return {
      n: count,
      p50: slice[Math.floor(n * 0.50)],
      p95: slice[Math.floor(n * 0.95)],
      p99: slice[Math.floor(n * 0.99)],
      max: slice[n - 1],
    }
  }

  summary() {
    const parts = []
    const ord = [...this.counters.keys()].sort()
    for (const k of ord) parts.push(`${k}=${this.counters.get(k)}`)
    return parts.join(' ')
  }

  fullReport() {
    const lines = ['-- counters --']
    const ord = [...this.counters.keys()].sort()
    for (const k of ord) lines.push(`  ${k.padEnd(28)} ${this.counters.get(k)}`)
    lines.push('-- latency (ms) --')
    for (const k of [...this.samples.keys()].sort()) {
      const p = this.percentiles(k)
      if (p) lines.push(
        `  ${k.padEnd(28)} n=${String(p.n).padEnd(6)} p50=${p.p50.toFixed(0).padStart(5)} p95=${p.p95.toFixed(0).padStart(5)} p99=${p.p99.toFixed(0).padStart(5)} max=${p.max.toFixed(0).padStart(5)}`,
      )
    }
    return lines.join('\n')
  }
}
