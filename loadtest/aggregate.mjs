#!/usr/bin/env node
// Merge stats JSON files from multiple loadtest processes / machines.
// Counters are summed; latency samples are concatenated and re-percentiled
// across the union (more accurate than averaging per-process p95).
//
// Usage:
//   node loadtest/aggregate.mjs /tmp/s1.json /tmp/s2.json /tmp/s3.json
//   node loadtest/aggregate.mjs /tmp/s*.json    # via shell expansion

import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: aggregate.mjs file1.json [file2.json ...]')
  process.exit(1)
}

const counters = new Map()
const samples = new Map()  // key -> flat array of all samples
const configs = []

for (const f of files) {
  let j
  try { j = JSON.parse(readFileSync(f, 'utf8')) }
  catch (e) { console.error(`skip ${f}: ${e.message}`); continue }
  configs.push({ file: f, ...j.config })
  for (const [k, v] of Object.entries(j.counters ?? {})) {
    counters.set(k, (counters.get(k) ?? 0) + Number(v))
  }
  for (const [k, arr] of Object.entries(j.samples ?? {})) {
    if (!samples.has(k)) samples.set(k, [])
    samples.get(k).push(...arr)
  }
}

console.log('=== merged from', files.length, 'runs ===')
for (const c of configs) {
  console.log(`  ${c.file}: pid=${c.pid} users=${c.users} dur=${c.duration_s}s target=${c.target}`)
}

console.log('\n-- counters (summed) --')
for (const k of [...counters.keys()].sort()) {
  console.log(`  ${k.padEnd(28)} ${counters.get(k)}`)
}

console.log('\n-- latency (ms, merged across runs) --')
for (const k of [...samples.keys()].sort()) {
  const arr = samples.get(k).sort((a, b) => a - b)
  const n = arr.length
  if (n === 0) continue
  const pct = (p) => arr[Math.min(Math.floor(n * p), n - 1)]
  console.log(
    `  ${k.padEnd(28)} n=${String(n).padEnd(6)} ` +
    `p50=${pct(0.50).toFixed(0).padStart(5)} ` +
    `p95=${pct(0.95).toFixed(0).padStart(5)} ` +
    `p99=${pct(0.99).toFixed(0).padStart(5)} ` +
    `max=${arr[n - 1].toFixed(0).padStart(5)}`,
  )
}
