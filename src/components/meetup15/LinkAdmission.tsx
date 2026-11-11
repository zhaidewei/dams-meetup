'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'

function subscribeToFragment(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function clearFragment() {
  window.history.replaceState(null, '', window.location.pathname)
}

export function LinkAdmission({ mode }: { mode: 'qr' | 'recover' }) {
  const fragment = useSyncExternalStore(subscribeToFragment, () => window.location.hash, () => '')
  const values = new URLSearchParams(fragment.slice(1))
  const qr = values.get('qr')
  const id = values.get('u')
  const token = values.get('t')
  const formRef = useRef<HTMLFormElement>(null)
  const submitted = useRef(false)

  useEffect(() => {
    if (mode !== 'qr' || !qr || !formRef.current || submitted.current) return
    submitted.current = true
    clearFragment()
    formRef.current.requestSubmit()
  }, [mode, qr])

  if (mode === 'recover') {
    if (!id || !token) return null
    return (
      <form method="post" action="/api/meetup/recover" onSubmit={clearFragment}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="token" value={token} />
        <button className="rounded bg-sky-900 px-4 py-2 text-white">恢复我的身份</button>
      </form>
    )
  }

  return (
    <form ref={formRef} method="post" action="/api/meetup/enter">
      <input type="hidden" name="method" value="qr" />
      <input type="hidden" name="credential" value={qr ?? ''} />
    </form>
  )
}
