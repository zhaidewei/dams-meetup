'use client'

import { useEffect, useRef } from 'react'

export function LinkAdmission({ mode }: { mode: 'qr' | 'recover' }) {
  const formRef = useRef<HTMLFormElement>(null)
  const submitted = useRef(false)

  useEffect(() => {
    const form = formRef.current
    if (!form || submitted.current) return
    const values = new URLSearchParams(window.location.hash.slice(1))
    const credential = mode === 'qr' ? values.get('qr') : values.get('t')
    const id = values.get('u')
    if (!credential || (mode === 'recover' && !id)) return
    const tokenInput = form.elements.namedItem(mode === 'qr' ? 'credential' : 'token') as HTMLInputElement
    tokenInput.value = credential
    if (id && mode === 'recover') {
      (form.elements.namedItem('id') as HTMLInputElement).value = id
    }
    submitted.current = true
    window.history.replaceState(null, '', window.location.pathname)
    form.requestSubmit()
  }, [mode])

  return (
    <form ref={formRef} method="post" action={mode === 'qr' ? '/api/meetup/enter' : '/api/meetup/recover'}>
      {mode === 'qr' ? (
        <>
          <input type="hidden" name="method" value="qr" />
          <input type="hidden" name="credential" />
        </>
      ) : (
        <>
          <input type="hidden" name="id" />
          <input type="hidden" name="token" />
        </>
      )}
    </form>
  )
}
