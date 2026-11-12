const sort = (a, b) => Number(a.answered) - Number(b.answered) || b.likes - a.likes ||
  a.createdAt - b.createdAt || a.id - b.id

// undefined means the frame is irrelevant. null means an HTTP snapshot is needed.
export function applyQaMessage(snapshot, message) {
  if (message === 'activity.updated') return null
  if (!message.startsWith('{')) return
  let change
  try {
    change = JSON.parse(message)
  } catch {
    return null
  }
  if (change?.type !== 'qa.updated') return
  if (!snapshot) return null
  if (change.section !== snapshot.section || snapshot.viewedRound?.closedAt != null) return
  if (change.roundId !== snapshot.viewedRound?.id) return null
  if (change.revision <= snapshot.qaRevision) return
  if (change.baseRevision !== null && change.baseRevision !== snapshot.qaRevision) return null
  const questions = new Map((change.baseRevision === null ? [] : snapshot.questions).map(question => [question.id, question]))
  for (const id of change.remove) questions.delete(id)
  for (const question of change.upsert) questions.set(question.id, question)
  return { ...snapshot, qaRevision: change.revision, questions: [...questions.values()].sort(sort),
    versions: snapshot.versions ? { ...snapshot.versions, questions: '' } : undefined }
}

export function watchLiveQa(members, labels, snapshots, load) {
  const started = performance.now()
  const expected = new Set(labels)
  const pending = new Set(members)
  const samples = []
  const scheduled = new Map()
  const reading = new Set()
  const again = new Set()
  let pushMessages = 0
  let httpRequests = 0
  let resolve
  let reject
  const finished = new Promise((done, fail) => { resolve = done; reject = fail })
  const timeout = setTimeout(() => reject(new Error(`${pending.size} viewers did not receive the complete round`)), 15_000)
  const stop = () => {
    clearTimeout(timeout)
    for (const timer of scheduled.values()) clearTimeout(timer)
    pending.clear()
  }
  void finished.catch(() => {})

  function record(cookie, snapshot) {
    if (!pending.has(cookie) || snapshot.questions.filter(question => expected.has(question.body)).length !== expected.size) return
    pending.delete(cookie)
    samples.push(performance.now() - started)
    if (!pending.size) {
      stop()
      resolve({ samples, pushMessages, httpRequests })
    }
  }

  function schedule(cookie) {
    if (!pending.has(cookie)) return
    if (reading.has(cookie)) {
      again.add(cookie)
      return
    }
    if (scheduled.has(cookie)) return
    scheduled.set(cookie, setTimeout(async () => {
      scheduled.delete(cookie)
      reading.add(cookie)
      try {
        httpRequests++
        record(cookie, (await load(cookie)).data)
      } catch (error) {
        reject(error)
      } finally {
        reading.delete(cookie)
        if (again.delete(cookie)) schedule(cookie)
      }
    }, 40))
  }

  function receive(cookie, message) {
    if (!pending.has(cookie)) return
    const next = applyQaMessage(snapshots.get(cookie), message)
    if (next === null) return schedule(cookie)
    if (next === undefined) return
    pushMessages++
    snapshots.set(cookie, next)
    record(cookie, next)
  }

  return { receive, finished, stop }
}
