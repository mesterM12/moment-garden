import { bindDrag, dragThreshold } from '@ui-sdk/core'
import { Button as ActionButton } from '@ui-sdk/react/button'
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from './ui/button'
import { SilkBow } from './ribbon-bow'
import type { Side } from './ribbon-cloth'
import { mountRibbon } from './ribbon-motion'
import '../styles/parcel.css'

export const COVER_EXIT_MS = 850

interface GiftCoverProps {
  ready: boolean
  exiting: boolean
  reducedMotion: boolean
  onOpen: (instant: boolean) => void
  onExit: () => void
}

// The two impressions share a plate but travel with their own sheets of paper.
function PrintPlate() {
  return (
    <svg className="parcel-definitions" width="0" height="0" aria-hidden="true">
      <defs>
        <pattern id="parcel-hatch" width="3.5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(37)"><path d="M.5 0v5" stroke="currentColor" opacity=".38" strokeWidth=".6" /></pattern>
        <g id="parcel-leaf" stroke="currentColor" strokeWidth=".85" strokeLinejoin="round">
          <path d="M0 0C-1-11 4-19 12-24l-1-3 5 .3 2-4 3 1 4-4 3 1 9-5c-4 5-3 10-7 13l1 2-5 2 .4 2.3-4 1 .5 2.2C16-8 10-3 0 0Z" fill="url(#parcel-hatch)" />
          <path d="M0 0c12-12 23-24 34-34M7-7l2-10m2 6 10-2m-7-1 1-10m3 6 10-4m-7 0 2-9m2 5 6-3" fill="none" strokeWidth=".65" />
        </g>
        <g id="parcel-corolla" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
          <path d="M2 26c-10 1-29-9-30-24-12-7-9-21-4-24 3-2 6-1 10 0-3-8 0-16 6-18 4-1 8 0 11 4 7-11 15-9 19-4 3-3 8-3 11 0 6 3 6 10 5 15 9-1 16 4 14 13 6 10-4 21-13 25-6 8-18 15-29 13Z" fill="url(#parcel-hatch)" />
          <path d="M2 26c-4-8-7-12-16-15-9-2-14-7-14-9m27 19c-7-10-6-15-13-20-11-8-12-15-8-23m23 43c-2-11 3-15-1-24-3-8-14-15-14-26m19 50c-1-10 4-14 10-22 5-9 3-18 12-24M9 20c9-11 18-10 25-18m-41-9c-1-11 2-14-5-22m14 28c-1-13 8-19 7-26m-19 9c-4-6-2-12-6-18m15 22c3-8 2-14-1-18m-18 24c-4-3-9-9-10-16m21 35c-9-5-14-8-16-11m45-9c2-8 6-13 14-16m-15 24c6-6 12-8 17-12" fill="none" />
          <path d="M-18-22c5 0 6-12 14-13 4 0 8 3 10 4 6-4 10-4 14 0 2 4-1 10-4 14M-9-24c4-2 5-5 9-5s6 4 6 4m-28 17c0 7 7 12 11 14m-15-25c-3 3-1 9 2 13m30 7c3-5 3-13 7-17m16 12c-2 4-7 6-12 9" fill="none" strokeWidth=".75" />
        </g>
        <g id="parcel-rose" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round">
          <path d="M104 259C86 212 72 183 74 145c3-37 9-60 8-91m19 203c-18-50-30-79-29-112 2-24 6-51 8-82M73 176c-6-20-16-26-32-35m32 15c6-22 23-40 43-50m-41 34c-7-15-21-28-38-35m41 7c11-21 18-33 33-39M87 218c9-20 12-29 24-39" />
          <use href="#parcel-leaf" transform="translate(43 142) rotate(-88) scale(.9)" /><use href="#parcel-leaf" transform="translate(57 153) rotate(-49) scale(.63)" />
          <use href="#parcel-leaf" transform="translate(109 109) rotate(13) scale(1.05)" /><use href="#parcel-leaf" transform="translate(99 116) rotate(-28) scale(.79)" /><use href="#parcel-leaf" transform="translate(94 120) rotate(60) scale(.7)" />
          <use href="#parcel-leaf" transform="translate(42 108) rotate(-95)" /><use href="#parcel-leaf" transform="translate(56 116) rotate(-48) scale(.8)" /><use href="#parcel-leaf" transform="translate(111 180) rotate(16)" /><use href="#parcel-leaf" transform="translate(100 189) rotate(-35) scale(.75)" />
          <path d="M82 69c-2-10-8-14-16-18 8 2 13 3 15 6 1-8 8-11 15-17-5 9-6 14-13 19" fill="url(#parcel-hatch)" />
          <use href="#parcel-corolla" transform="translate(77 39) rotate(-11)" />
          <path d="M106 77c-5-9-4-18 0-23 2-7 7-11 9-11 1 6 4 7 5 12 3 7-2 14-11 21m-2-1c4-7 3-15 8-22m-6 24c5-2 9-4 15-12m-17 12c-3-7-7-9-9-16" fill="url(#parcel-hatch)" />
        </g>
      </defs>
    </svg>
  )
}

function Tissue({ side }: { side: 'left' | 'right' }) {
  return (
    <div className={`parcel-sheet parcel-sheet-${side}`} aria-hidden="true">
      <svg className="parcel-print" viewBox="0 0 160 260"><use href="#parcel-rose" /></svg>
      <svg className="parcel-print parcel-print-echo" viewBox="0 0 160 260"><use href="#parcel-rose" /></svg>
      <span className="parcel-crease" />
    </div>
  )
}

export function GiftCover({ ready, exiting, reducedMotion, onOpen, onExit }: GiftCoverProps) {
  const opener = useRef<HTMLButtonElement>(null)
  const plate = useRef<SVGSVGElement>(null)
  const cover = useRef<HTMLDivElement>(null)
  const motion = useRef<ReturnType<typeof mountRibbon> | null>(null)
  const committed = useRef(false)
  const suppressClick = useRef(false)
  const stopDrag = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    const button = opener.current
    if (!ready || exiting || !button || document.activeElement !== document.body) return
    const { top, bottom } = button.getBoundingClientRect()
    if (top >= 0 && bottom <= window.innerHeight) button.focus({ preventScroll: true })
  }, [ready, exiting])

  useEffect(() => {
    if (!plate.current) return
    const controller = mountRibbon(plate.current)
    motion.current = controller
    return () => {
      stopDrag.current?.()
      controller.stop()
      motion.current = null
    }
  }, [])

  useEffect(() => {
    if (!exiting) return
    if (reducedMotion) {
      onExit()
      return
    }
    const fallback = window.setTimeout(onExit, COVER_EXIT_MS + 60)
    return () => window.clearTimeout(fallback)
  }, [exiting, onExit, reducedMotion])

  function open(nonPointer: boolean) {
    if (committed.current || exiting || !ready) return
    committed.current = true
    stopDrag.current?.()
    if (!nonPointer && !reducedMotion && motion.current) {
      const pose = motion.current.catch()
      cover.current?.toggleAttribute('data-pulled-left', pose.side < 0)
      cover.current?.style.setProperty('--silk-slip', `${motion.current.release()}ms`)
    }
    onOpen(nonPointer)
  }

  function pull(event: ReactPointerEvent<HTMLButtonElement>) {
    const silk = motion.current
    if (!ready || exiting || committed.current || !silk || event.button !== 0) return
    if (!event.isPrimary) {
      stopDrag.current?.()
      suppressClick.current = true
      silk.restore(reducedMotion)
      return
    }
    stopDrag.current?.()
    suppressClick.current = false
    const initial = silk.catch()
    const startX = event.clientX, startY = event.clientY
    const box = event.currentTarget.getBoundingClientRect()
    const scale = 380 / (box.width || 380)
    const across = (startX - box.left) * scale - 186
    const fromTail = Math.abs(across) > 36
    const track = (dx: number, dy: number) => {
      const horizontal = initial.dx + dx * scale
      const side: Side = initial.dx ? initial.side : (fromTail ? across : horizontal) < 0 ? -1 : 1
      silk.show({ side, dx: horizontal, dy: initial.dy + dy * scale, grip: initial.dx ? initial.grip : fromTail ? Math.abs(across) : 100 })
    }
    stopDrag.current = bindDrag(event.currentTarget, event.nativeEvent, {
      threshold: dragThreshold,
      cancelOnEscape: true,
      onStart: () => { suppressClick.current = true },
      onMove: ({ x, y }) => track(x - startX, y - startY),
      onEnd: (up, canceled) => {
        stopDrag.current = undefined
        const dx = up.clientX - startX, dy = up.clientY - startY
        suppressClick.current ||= canceled || Math.max(Math.abs(dx), Math.abs(dy)) >= dragThreshold
        if (!canceled && Math.abs(dx) >= 36 && Math.abs(dx) > Math.abs(dy)) {
          track(dx, dy)
          open(false)
        } else silk.restore(reducedMotion)
      },
    })
  }

  return (
    <div ref={cover} className="flower-cover parcel" data-exiting={exiting ? '' : undefined} inert={exiting} aria-hidden={exiting || undefined}>
      <PrintPlate />
      <Tissue side="left" /><Tissue side="right" />
      <div className="parcel-label">
        <svg className="parcel-thread" aria-hidden="true" viewBox="0 0 85 110" preserveAspectRatio="none"><path d="M76 0C35 19 85 63 10 110m68-110C44 27 84 68 12 110" fill="none" stroke="#886e55" strokeWidth="1.2" /></svg>
        <div className="parcel-tag"><h2 id="flower-cover-note">A little something,<br /><em>just for you.</em></h2></div>
      </div>
      <div className="parcel-tie">
        <ActionButton disabled={!ready} aria-label="Pull the ribbon" aria-describedby="flower-cover-note" onPointerDown={pull} onClick={(event) => { if (!suppressClick.current || event.detail === 0) open(event.detail === 0) }} render={<Button className="parcel-handle" variant="ghost" />}>
          <SilkBow plate={plate} />
        </ActionButton>
      </div>
      <div className="parcel-invitation">
        <p className="parcel-hint">Pull the ribbon, or</p>
        <ActionButton ref={opener} disabled={!ready} aria-describedby="flower-cover-note" onClick={(event) => open(event.detail === 0)} render={<Button className="flower-control flower-open parcel-open" />}>
          Open your flowers <svg width="19" height="12" viewBox="0 0 19 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M1 6h15m-5-4.5L16 6l-5 4.5" /></svg>
        </ActionButton>
        <p className="parcel-loading" role="status">{ready ? '' : 'Getting your flowers ready…'}</p>
      </div>
    </div>
  )
}
