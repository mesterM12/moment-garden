'use client'

import { useEffect, useRef, useState } from 'react'
import type { GardenEngine } from '../garden/types'
import { read } from '../lib/bouquet-link'
import '../styles/social.css'

const CAPTURE_ERROR = 'This bouquet couldn’t be prepared for its postcard.'
const REQUIRED_FONTS = [
  { font: '400 64px "Instrument Serif"', text: 'Flowers' },
  { font: 'italic 400 64px "Instrument Serif"', text: 'for You' },
  { font: '400 20px "DM Sans"', text: 'A little something, just for you.' },
]

async function loadFonts() {
  const fonts = document.fonts
  if (!fonts) throw new Error('Font loading is unavailable.')
  const loaded = await Promise.all(REQUIRED_FONTS.map(({ font, text }) => fonts.load(font, text)))
  await fonts.ready
  if (loaded.some(faces => !faces.length || faces.some(face => face.status !== 'loaded'))
    || REQUIRED_FONTS.some(({ font, text }) => !fonts.check(font, text))) {
    throw new Error('The postcard fonts could not load.')
  }
}

type CaptureSession = {
  engine: GardenEngine | null
  failed: boolean
  bloomed: boolean
  fail: () => void
  timer: ReturnType<typeof setTimeout> | undefined
}

export default function SocialCapture({ search = window.location.search }: { search?: string }) {
  const link = read(search)
  const seed = link.status === 'valid' ? link.timestamp : null
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<CaptureSession | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    const root = document.documentElement
    root.dataset.ogStatus = 'loading'
    setName('')
    setError(false)
    const session: CaptureSession = {
      engine: null, failed: false, bloomed: false, timer: undefined,
      fail() {
        if (!active || session.failed) return
        session.failed = true
        clearTimeout(session.timer)
        root.dataset.ogStatus = 'error'
        setError(true)
      },
    }
    sessionRef.current = session
    session.timer = setTimeout(session.fail, 15_000)

    async function prepare() {
      try {
        if (seed === null) throw new Error('A canonical bouquet token is required.')
        const [module] = await Promise.all([import('../garden/engine'), loadFonts()])
        if (!active || session.failed) return
        const canvas = canvasRef.current
        if (!canvas) throw new Error('The postcard canvas is missing.')
        session.engine = module.createGarden(canvas, {
          onError(message) { if (message) session.fail() },
          onContextChange(lost) { if (lost) session.fail() },
          onBloomProgress(progress) { session.bloomed = progress === 1 },
        })
        if (session.failed) return
        session.engine.setReducedMotion(true)
        const bouquet = session.engine.show(seed)
        session.engine.bloom({ instant: true })
        session.engine.resetView({ instant: true })
        if (!session.failed) setName(bouquet.name)
      } catch {
        session.fail()
      }
    }
    void prepare()

    return () => {
      active = false
      clearTimeout(session.timer)
      session.engine?.dispose()
      if (sessionRef.current === session) {
        sessionRef.current = null
        delete root.dataset.ogStatus
      }
    }
  }, [seed])

  useEffect(() => {
    const session = sessionRef.current
    if (!name || error || !session?.engine || session.failed) return
    let secondFrame = 0
    // Two frames follow the name's React commit, so font layout and canvas compositing settle.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        if (sessionRef.current !== session || session.failed) return
        try {
          const canvas = canvasRef.current
          const rect = canvas?.getBoundingClientRect()
          if (!canvas || !rect?.width || !rect.height || !canvas.width || !canvas.height
            || canvas.dataset.seed !== String(seed) || !canvas.dataset.version || !session.bloomed
            || document.hidden) throw new Error('The bouquet has not rendered.')
          session.engine!.resetView({ instant: true })
          if (session.failed) return
          clearTimeout(session.timer)
          document.documentElement.dataset.ogStatus = 'ready'
        } catch {
          session.fail()
        }
      })
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [name, error, seed])

  return (
    <main className="social-capture" data-og-seed={seed ?? undefined}>
      <article className="flower-postcard social-postcard">
        <div className="social-note">
          <header className="flower-intro social-intro">
            <h1>Flowers<br /><em>for You</em></h1>
            <p>A little something,<br />just for you.</p>
          </header>
          <footer className="flower-identity social-identity">
            <h2>{error ? 'A little pause' : name}</h2>
            <p>{error ? CAPTURE_ERROR : 'A one-of-a-kind bouquet to open and keep.'}</p>
          </footer>
        </div>
        <div className="flower-stage social-stage" inert>
          <canvas ref={canvasRef} className="flower-canvas social-canvas" role="img" aria-label={name ? `${name}, a hand-tied bouquet` : 'A hand-tied bouquet'} />
        </div>
      </article>
    </main>
  )
}
