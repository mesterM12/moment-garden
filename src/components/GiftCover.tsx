import { Button as ActionButton } from '@ui-sdk/react/button'
import { useEffect, useRef } from 'react'
import { Button } from './ui/button'

export const COVER_EXIT_MS = 280

interface GiftCoverProps {
  ready: boolean
  exiting: boolean
  reducedMotion: boolean
  onOpen: (instant: boolean) => void
  onExit: () => void
}

export function GiftCover({ ready, exiting, reducedMotion, onOpen, onExit }: GiftCoverProps) {
  const opener = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const button = opener.current
    if (!ready || exiting || !button || document.activeElement !== document.body) return
    const { top, bottom } = button.getBoundingClientRect()
    if (top >= 0 && bottom <= window.innerHeight) button.focus({ preventScroll: true })
  }, [ready, exiting])

  useEffect(() => {
    if (!exiting) return
    if (reducedMotion) {
      onExit()
      return
    }
    const fallback = window.setTimeout(onExit, COVER_EXIT_MS + 60)
    return () => window.clearTimeout(fallback)
  }, [exiting, onExit, reducedMotion])

  return (
    <div
      className="flower-cover"
      data-exiting={exiting ? '' : undefined}
      inert={exiting}
      aria-hidden={exiting || undefined}
      onTransitionEnd={(event) => {
        if (exiting && event.target === event.currentTarget && event.propertyName === 'opacity') onExit()
      }}
    >
      <svg className="flower-cover-seal" viewBox="0 0 104 76" fill="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round">
          <rect x="8.5" y="9.5" width="87" height="57" rx="4" />
          <path d="m9 13 43 30 43-30M9 62l30-25m56 25L65 37" />
        </g>
        <circle cx="52" cy="42" r="8.75" fill="currentColor" />
        <path d="M52 40.5c-2.8-4.4-5.4-.6-1 1.5-4.4 2.1-1.8 5.9 1 1.5 2.8 4.4 5.4.6 1-1.5 4.4-2.1 1.8-5.9-1-1.5Z" stroke="var(--paper)" strokeWidth=".85" strokeLinejoin="round" />
      </svg>
      <h2 id="flower-cover-note">A little something,<br />just for you.</h2>
      <ActionButton
        ref={opener}
        disabled={!ready}
        aria-describedby="flower-cover-note"
        onClick={(event) => onOpen(event.detail === 0)}
        render={<Button className="flower-control flower-primary flower-open" />}
      >
        Open your flowers
      </ActionButton>
      <p className="flower-cover-loading" role="status">{ready ? '' : 'Getting your flowers ready…'}</p>
    </div>
  )
}
