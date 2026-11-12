'use client'

import { useEffect, useRef, useState } from 'react'
import { RAFFLE_ANIMATION_MS, type LotteryScreen } from '@/lib/meetup15/raffle'

function playTone(context: AudioContext, frequency: number, offset: number, duration: number) {
  const start = context.currentTime + offset
  const tone = context.createOscillator()
  const volume = context.createGain()
  tone.type = 'triangle'
  tone.frequency.value = frequency
  volume.gain.setValueAtTime(0.001, start)
  volume.gain.exponentialRampToValueAtTime(0.065, start + 0.008)
  volume.gain.exponentialRampToValueAtTime(0.001, start + duration)
  tone.connect(volume).connect(context.destination)
  tone.start(start)
  tone.stop(start + duration)
}

export function useRaffleAnimation(roundId: number | null, lottery: LotteryScreen | null, candidateCount: number) {
  const readyAt = lottery?.phase === 'drawing' ? lottery.readyAt : null
  const [frame, setFrame] = useState<{ roundId: number; index: number | null; progress: number } | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [soundError, setSoundError] = useState(false)
  const audio = useRef<AudioContext | null>(null)
  const soundOn = useRef(false)
  const observedDraw = useRef<number | null>(null)

  async function toggleSound() {
    if (soundOn.current) {
      soundOn.current = false
      const context = audio.current
      audio.current = null
      if (context) void context.close().catch(() => {})
      setSoundEnabled(false)
      return
    }
    try {
      const context = audio.current ??= new AudioContext()
      await context.resume()
      if (audio.current !== context) return
      soundOn.current = context.state === 'running'
      setSoundEnabled(soundOn.current)
      setSoundError(!soundOn.current)
    } catch {
      setSoundError(true)
    }
  }

  useEffect(() => () => {
    const context = audio.current
    audio.current = null
    if (context) void context.close().catch(() => {})
  }, [])

  useEffect(() => {
    if (readyAt === null || roundId === null) return
    observedDraw.current = roundId
    let index = -1
    let timer: ReturnType<typeof setTimeout>

    function advance(end: number, round: number) {
      const remaining = end - Date.now()
      if (remaining <= 0) {
        setFrame({ roundId: round, index: null, progress: 1 })
        return
      }
      const progress = Math.max(0, 1 - remaining / RAFFLE_ANIMATION_MS)
      if (candidateCount > 0) {
        const step = candidateCount > 1 ? 1 + Math.floor(Math.random() * (candidateCount - 1)) : 1
        index = (index + step) % candidateCount
      }
      setFrame({ roundId: round, index: index >= 0 ? index : null, progress })
      const context = audio.current
      if (soundOn.current && context?.state === 'running') playTone(context, 640 - 180 * progress, 0, 0.04)
      timer = setTimeout(() => advance(end, round), Math.min(remaining, 75 + 420 * progress ** 3))
    }

    timer = setTimeout(() => advance(readyAt, roundId), 0)
    return () => clearTimeout(timer)
  }, [candidateCount, readyAt, roundId])

  const phase = lottery?.phase
  useEffect(() => {
    if (phase !== 'winner' || roundId === null || observedDraw.current !== roundId) return
    observedDraw.current = null
    const context = audio.current
    if (soundOn.current && context?.state === 'running') {
      [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
        playTone(context, note, index * 0.12, index === 3 ? 0.42 : 0.18)
      })
    }
  }, [phase, roundId])

  const drawingFrame = readyAt !== null && frame?.roundId === roundId ? frame : null
  return { drawingFrame, soundEnabled, soundError, toggleSound }
}
