// DeepSeek API 健康检查 — slice 3 实施前的连通性验证。
//
// 跑法：
//   DEEPSEEK_API_KEY=$(secret get deepseek-dams-key) node scripts/deepseek-healthcheck.mjs
//
// 退出码：0 = 连通且能解析；非 0 = 配置 / 网络 / 解析异常。

const apiKey = process.env.DEEPSEEK_API_KEY
if (!apiKey) {
  console.error('❌ DEEPSEEK_API_KEY 未设置')
  console.error('   跑法：DEEPSEEK_API_KEY=$(secret get deepseek-dams-key) node scripts/deepseek-healthcheck.mjs')
  process.exit(1)
}

const url = 'https://api.deepseek.com/chat/completions'
const payload = {
  model: 'deepseek-v4-flash',
  messages: [
    { role: 'system', content: '只回复"ok"两个字，不要别的。' },
    { role: 'user', content: 'ping' },
  ],
  max_tokens: 5,
  temperature: 0,
}

const start = performance.now()
let res
try {
  res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })
} catch (err) {
  console.error('❌ 网络错误:', err.message)
  process.exit(2)
}
const elapsed = Math.round(performance.now() - start)

if (!res.ok) {
  const text = await res.text().catch(() => '<empty>')
  console.error(`❌ HTTP ${res.status} (${elapsed}ms)`)
  console.error(`   body: ${text.slice(0, 500)}`)
  process.exit(3)
}

let data
try {
  data = await res.json()
} catch {
  console.error(`❌ 解析 JSON 失败 (${elapsed}ms)`)
  process.exit(4)
}

const reply = data?.choices?.[0]?.message?.content
if (typeof reply !== 'string') {
  console.error(`❌ 响应结构异常: 缺 choices[0].message.content`)
  console.error('   raw:', JSON.stringify(data).slice(0, 500))
  process.exit(5)
}

console.log(`✅ DeepSeek 连通 (${elapsed}ms)`)
console.log(`   model: ${data.model}`)
console.log(`   reply: ${reply.trim()}`)
console.log(`   usage:`, data.usage)
