import assert from 'node:assert/strict'

export const FIELD_BROWSER_MEMBERS = 4
export const FIELD_QUESTIONS = 24
export const FIELD_LIKES = 8
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const questionRows = 'section[aria-label="问答"] li > p:first-child'

function installRefreshObserver() {
  const messages = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage')
  Object.defineProperty(WebSocket.prototype, 'onmessage', {
    ...messages,
    set(listener) {
      messages.set.call(this, listener && function(event) {
        if (!window.m6PauseUpdates) listener.call(this, event)
      })
    },
  })

  const label = sessionStorage.getItem('m6-refresh-question')
  if (!label) return
  const times = window.m6RefreshTimes = { loading: null, latest: null }
  let pendingFrame = false
  const inspect = () => {
    if (pendingFrame) return
    pendingFrame = true
    requestAnimationFrame(() => {
      pendingFrame = false
      const loading = [...document.querySelectorAll('[role="status"]')].find(row => row.textContent.includes('正在加载讨论区'))
      if (times.loading === null && loading?.checkVisibility()) times.loading = Date.now()
      const latest = [...document.querySelectorAll('section[aria-label="问答"] li > p:first-child')].find(row => row.textContent === label)
      if (times.latest === null && latest?.checkVisibility()) times.latest = Date.now()
    })
  }
  new MutationObserver(inspect).observe(document, { subtree: true, childList: true, characterData: true })
  inspect()
}

async function openPage(browser, base, cookie, route, viewport, onResponse, refreshPhone = false) {
  const mobile = route === '/feed?view=free'
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile })
  const [name, value] = cookie.split('=')
  await context.addCookies([{ name, value, url: base }])
  if (refreshPhone) await context.addInitScript(installRefreshObserver)
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

async function watchDisplay(page, selector, observePaint) {
  await page.evaluate(({ selector, observePaint }) => {
    window.m6FieldSeen = {}
    let pendingFrame = false
    const record = () => {
      pendingFrame = false
      for (const row of document.querySelectorAll(selector)) {
        if (row.textContent.startsWith('M6 现场问题 ') && row.checkVisibility()) {
          window.m6FieldSeen[row.textContent] ??= Date.now()
        }
      }
    }
    const inspect = observePaint ? () => {
      if (pendingFrame) return
      pendingFrame = true
      requestAnimationFrame(record)
    } : record
    new MutationObserver(inspect).observe(document.body, { childList: true, subtree: true, characterData: true })
    inspect()
  }, { selector, observePaint })
}

async function refreshPhone(page, label) {
  assert.equal(await page.getByText(label, { exact: true }).count(), 0, 'Refresh phone must have missed this question')
  const started = Date.now()
  await page.reload({ waitUntil: 'commit', timeout: 10_000 })
  await page.waitForFunction(() => window.m6RefreshTimes?.latest != null, null, { timeout: 12_000 })
  const { loading, latest } = await page.evaluate(() => window.m6RefreshTimes)
  return { refreshLoading: loading === null ? null : loading - started, refreshLatest: latest - started }
}

async function waitConnected(views) {
  for (let i = 0; i < 50 && views.some(view => !view.connected()); i++) await delay(100)
  assert.ok(views.every(view => view.connected()), 'Browser WebSockets did not connect')
}

export async function runFieldQa({ browser, base, admin, members, online, onResponse, readRound, answer, like, refresh, samples, displayFailures }) {
  const mobileViewport = { width: 390, height: 844 }
  const phones = await Promise.all(members.map((cookie, i) => openPage(browser, base, cookie, '/feed?view=free', mobileViewport, onResponse, refresh && i === 3)))
  const screen = await openPage(browser, base, admin, '/screen', { width: 1024, height: 768 }, onResponse)
  try {
    await Promise.all([
      ...phones.map(({ page }) => page.getByLabel('你的问题', { exact: true }).waitFor()),
      screen.page.getByRole('heading', { name: '问答 · M6 测试问答' }).waitFor(),
    ])
    await waitConnected([...phones, screen])
    const observedPhones = refresh ? phones.slice(0, 3) : phones
    await Promise.all([
      ...observedPhones.map(({ page }) => watchDisplay(page, questionRows, refresh)),
      watchDisplay(screen.page, 'article[aria-label="当前最高票问题"] > p', refresh),
    ])
    for (let i = 0; i < FIELD_QUESTIONS; i++) {
      if (refresh) await waitConnected([phones[3]])
      assert.equal(online() + phones.filter(phone => phone.connected()).length, 200, 'Expected 200 online attendees')
      assert.ok(screen.connected(), 'Projection disconnected')
      const author = phones[i % 3].page
      const label = 'M6 现场问题 ' + String(i + 1).padStart(2, '0') + '：如何验证客户愿意为产品付费？'
      const observer = phones[3].page
      if (refresh) await observer.evaluate(label => {
        window.m6PauseUpdates = true
        sessionStorage.setItem('m6-refresh-question', label)
      }, label)
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
      const views = [['own', author], ['projection', screen.page]]
      if (!refresh) views.push(['other', observer])
      const sample = { label }
      const shown = await Promise.allSettled(views.map(async ([surface, page]) => {
        try {
          await page.waitForFunction(label => window.m6FieldSeen[label] !== undefined, label, { timeout: 8000 })
          sample[surface] = await page.evaluate(label => window.m6FieldSeen[label], label) - started
        } catch (error) {
          displayFailures.push({ label, surface, error: error.message })
          throw error
        }
      }))
      samples.push(sample)
      if (shown.some(result => result.status === 'rejected')) throw new Error('Field question did not appear on every display')
      if (refresh) {
        try {
          Object.assign(sample, await refreshPhone(observer, label))
        } catch (error) {
          displayFailures.push({ label, surface: 'refresh', error: error.message })
          throw error
        }
      }
      const question = (await readRound()).questions.find(question => question.body === label)
      assert.ok(question, 'Question missing from the round')
      if (i % 3 === 2) await like(question.id, Math.floor(i / 3))
      await answer(question.id)
      await delay(1000 + (i * 431) % 500)
    }
  } finally {
    await Promise.all([...phones, screen].map(view => view.context.close()))
  }
}
