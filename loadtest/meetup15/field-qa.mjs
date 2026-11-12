import assert from 'node:assert/strict'

export const FIELD_BROWSER_MEMBERS = 4
export const FIELD_QUESTIONS = 24
export const FIELD_LIKES = 8
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function openPage(browser, base, cookie, route, viewport, onResponse) {
  const mobile = route === '/feed'
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })
  const [name, value] = cookie.split('=')
  await context.addCookies([{ name, value, url: base }])
  const page = await context.newPage()
  page.on('response', onResponse)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  const urls = new Set()
  const open = new Set()
  cdp.on('Network.webSocketCreated', ({ requestId, url }) => {
    if (new URL(url).pathname === '/api/discussion/updates') urls.add(requestId)
  })
  cdp.on('Network.webSocketHandshakeResponseReceived', ({ requestId, response }) => {
    if (urls.has(requestId) && response.status === 101) open.add(requestId)
  })
  cdp.on('Network.webSocketClosed', ({ requestId }) => {
    urls.delete(requestId)
    open.delete(requestId)
  })
  await page.goto(base + route)
  return { context, page, connected: () => open.size > 0 }
}

async function watchDisplay(page, selector) {
  await page.evaluate(selector => {
    window.m6FieldSeen = {}
    const record = () => {
      for (const row of document.querySelectorAll(selector)) {
        if (row.textContent.startsWith('M6 现场问题 ') && row.checkVisibility()) {
          window.m6FieldSeen[row.textContent] ??= Date.now()
        }
      }
    }
    new MutationObserver(record).observe(document.body, { childList: true, subtree: true, characterData: true })
    record()
  }, selector)
}

export async function runFieldQa({ browser, base, admin, members, online, onResponse, readRound, answer, like }) {
  const mobileViewport = { width: 390, height: 844 }
  const phones = await Promise.all(members.map(cookie => openPage(browser, base, cookie, '/feed', mobileViewport, onResponse)))
  const screen = await openPage(browser, base, admin, '/screen', { width: 1024, height: 768 }, onResponse)
  try {
    await Promise.all([
      ...phones.map(({ page }) => page.getByLabel('你的问题', { exact: true }).waitFor()),
      screen.page.getByRole('heading', { name: '嘉宾问答 · M6 测试嘉宾' }).waitFor(),
    ])
    for (let i = 0; i < 50 && [...phones, screen].some(view => !view.connected()); i++) await delay(100)
    assert.ok([...phones, screen].every(view => view.connected()), 'Browser WebSockets did not connect')
    await Promise.all([
      ...phones.map(({ page }) => watchDisplay(page, 'section[aria-label="问答"] li > p:first-child')),
      watchDisplay(screen.page, 'article[aria-label="当前最高票问题"] > p'),
    ])
    const samples = []
    for (let i = 0; i < FIELD_QUESTIONS; i++) {
      assert.equal(online() + phones.filter(phone => phone.connected()).length, 200, 'Expected 200 online attendees')
      assert.ok(screen.connected(), 'Projection disconnected')
      const author = phones[i % 3].page
      const label = 'M6 现场问题 ' + String(i + 1).padStart(2, '0') + '：如何验证客户愿意为产品付费？'
      await author.getByLabel('你的问题', { exact: true }).fill(label)
      const ack = author.waitForResponse(response => response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/discussion', { timeout: 8000 })
      void ack.catch(() => {})
      const started = await author.getByRole('button', { name: '提交问题', exact: true }).evaluate(button => {
        const time = Date.now()
        button.click()
        return time
      })
      const response = await ack
      assert.ok(response.ok(), 'Question submission failed')
      const views = [author, phones[3].page, screen.page]
      const [own, other, projection] = await Promise.all(views.map(async page => {
        await page.waitForFunction(label => window.m6FieldSeen[label] !== undefined, label, { timeout: 8000 })
        return await page.evaluate(label => window.m6FieldSeen[label], label) - started
      }))
      samples.push({ label, own, other, projection })
      const question = (await readRound()).questions.find(question => question.body === label)
      assert.ok(question, 'Question missing from the round')
      if (i % 3 === 2) await like(question.id, Math.floor(i / 3))
      await answer(question.id)
      await delay(1000 + (i * 431) % 500)
    }
    return samples
  } finally {
    await Promise.all([...phones, screen].map(view => view.context.close()))
  }
}
