// DeepSeek 客户端：发 chat completion，要求 JSON 输出，做严格解析。
// 失败抛 Error，调用方负责 try/catch + 写 match_runs 日志。

export type Recommendation = {
  post_id: number
  user_id: string
  reason: string
}

const ENDPOINT = 'https://api.deepseek.com/chat/completions'

const SYSTEM_PROMPT = `你是 DAMS Meetup 的 AI 撮合助手。会议主题：数据 / AI / 工程。

每个 candidate 帖子是某用户**私下委托你**帮他匹配的需求（不公开，不要在 reason 中复述暗需求原文）。
从全场用户画像中找最匹配的 1-3 人，给出**引用对方公开帖**的具体理由。

严格输出 JSON：
{
  "recommendations": [
    {"post_id": <number>, "user_id": "<uuid>", "reason": "<中文一句话>"}
  ]
}

硬性要求：
- 不要推荐 candidate 帖子的作者本人
- post_id 必须来自 candidate 列表，user_id 必须来自全场画像
- 每个 candidate 最多 3 条推荐；没合适的就少推荐或不推荐（不要硬凑）
- reason 必须引用对方画像里的具体内容（公司 / 帖子 / tags），不要泛泛而谈
- reason 不要复述 candidate 的暗需求原文，只说"你提到的需求"
- 只输出 JSON，不要任何额外文字、不要 markdown 包裹`

export async function callDeepSeek(userPrompt: string, apiKey: string): Promise<Recommendation[]> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new Error('DeepSeek response missing choices[0].message.content')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`DeepSeek output is not valid JSON: ${content.slice(0, 200)}`)
  }

  const recs = (parsed as { recommendations?: unknown })?.recommendations
  if (!Array.isArray(recs)) {
    throw new Error('DeepSeek output missing "recommendations" array')
  }

  return recs.filter((r: unknown): r is Recommendation =>
    typeof r === 'object' &&
    r !== null &&
    typeof (r as Recommendation).post_id === 'number' &&
    typeof (r as Recommendation).user_id === 'string' &&
    typeof (r as Recommendation).reason === 'string' &&
    (r as Recommendation).reason.length > 0,
  )
}
