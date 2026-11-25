import { Button as ActionButton } from '@ui-sdk/react/button'
import { ArrowDownToLine, RotateCcw, RotateCw, Sprout } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ActionFeedback, ActionIcon } from './components/ActionFeedback'
import { GiftCover } from './components/GiftCover'
import { ShareFlowers } from './components/ShareFlowers'
import { SoundToggle } from './components/SoundToggle'
import { Button } from './components/ui/button'
import type { BouquetInfo, GardenEngine } from './garden/types'
import { getReducedMotion, useReducedMotion } from './hooks/useReducedMotion'
import { useOpeningSound } from './hooks/useOpeningSound'
import { create, read, withoutBouquet } from './lib/bouquet-link'

const dates = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const flowerNames = new Intl.ListFormat('en')
const previewError = 'These flowers couldn’t open. Try reloading the postcard.'

function focusPreview(element: HTMLElement) {
  element.focus({ preventScroll: true })
  const { top, bottom, height } = element.getBoundingClientRect()
  const visible = Math.min(bottom, window.innerHeight) - Math.max(top, 0)
  if (visible < Math.min(height, window.innerHeight) / 2) {
    element.scrollIntoView({ block: 'start', behavior: 'instant' })
  }
}

export default function App() {
  const [initial] = useState(() => {
    const incoming = read(window.location.search)
    return { incoming, seed: incoming.status === 'valid' ? incoming.timestamp : Date.now() }
  })
  const [linkStatus, setLinkStatus] = useState(initial.incoming.status)
  const [bouquet, setBouquet] = useState<BouquetInfo | null>(null)
  const [cover, setCover] = useState<'closed' | 'exiting' | 'gone'>('closed')
  const [pointerOpened, setPointerOpened] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [contextLost, setContextLost] = useState(false)
  const [saveResult, setSaveResult] = useState<'downloaded' | 'failed' | null>(null)
  const reducedMotion = useReducedMotion()
  const openingSound = useOpeningSound()

  const canvas = useRef<HTMLCanvasElement>(null)
  const fallback = useRef<HTMLDivElement>(null)
  const engine = useRef<GardenEngine | null>(null)
  const activeSeed = useRef(initial.seed)
  const lastFreshSeed = useRef(initial.incoming.status === 'valid' ? 0 : initial.seed)
  const opened = useRef(false)
  const focusTarget = useRef<'preview' | 'fallback' | null>(null)
  const lastStatus = useRef('')
  const dismissCover = useCallback(() => setCover('gone'), [])

  useEffect(() => {
    const surface = canvas.current
    if (!surface) return
    let canceled = false
    let garden: GardenEngine | undefined

    function uncoverForFailure() {
      const active = document.activeElement
      if (active === surface || (active instanceof HTMLElement && active.matches('.flower-open, .flower-render-control'))) {
        focusTarget.current = 'fallback'
      }
      opened.current = true
      setCover('gone')
    }

    async function prepare() {
      try {
        const { createGarden } = await import('./garden/engine')
        if (canceled || !surface) return
        garden = createGarden(surface, {
          onStatus(next) {
            if (canceled || next === lastStatus.current) return
            lastStatus.current = next
            setStatus(next)
          },
          onError(message) {
            if (canceled) return
            if (message) uncoverForFailure()
            setError(message)
          },
          onContextChange(lost) {
            if (canceled) return
            if (lost) uncoverForFailure()
            else if (fallback.current?.contains(document.activeElement)) focusTarget.current = 'preview'
            setContextLost(lost)
          },
        })
        engine.current = garden
        garden.setReducedMotion(getReducedMotion())
        setBouquet(garden.show(activeSeed.current))
      } catch {
        if (canceled) return
        engine.current = null
        garden?.dispose()
        garden = undefined
        uncoverForFailure()
        setError((current) => current ?? previewError)
      }
    }

    void prepare()
    return () => {
      canceled = true
      engine.current = null
      garden?.dispose()
    }
  }, [])

  useEffect(() => {
    engine.current?.setReducedMotion(reducedMotion)
  }, [reducedMotion])

  const sealed = cover === 'closed'
  const unavailable = Boolean(error) || contextLost
  const ready = Boolean(bouquet) && !unavailable
  const shareSeed = bouquet?.timestamp ?? (initial.incoming.status === 'valid' ? initial.seed : null)
  const shareUrl = shareSeed === null ? null : create(window.location.href, shareSeed)

  useLayoutEffect(() => {
    if (sealed) return
    const target = focusTarget.current
    if (target === 'preview' && ready && canvas.current) focusPreview(canvas.current)
    else if (target === 'fallback' && unavailable && fallback.current) focusPreview(fallback.current)
    else return
    focusTarget.current = null
  }, [ready, sealed, unavailable])

  function openFlowers(nonPointer: boolean) {
    if (!ready || opened.current || !engine.current) return
    const instant = nonPointer || reducedMotion
    opened.current = true
    openingSound.play()
    focusTarget.current = 'preview'
    setPointerOpened(!nonPointer)
    setCover(instant ? 'gone' : 'exiting')
    engine.current.bloom({ instant })
  }

  function growAnother(nonPointer: boolean) {
    const garden = engine.current
    if (!garden || !ready) return
    let seed = Math.max(lastFreshSeed.current + 1, Date.now())
    if (seed === activeSeed.current) seed += 1
    lastFreshSeed.current = seed
    const address = withoutBouquet(window.location.href)
    try {
      const next = garden.show(seed)
      activeSeed.current = seed
      setBouquet(next)
      setSaveResult(null)
      setLinkStatus('absent')
      if (address !== window.location.href) history.replaceState(history.state, '', address)
      garden.bloom({ instant: nonPointer || reducedMotion })
    } catch {
      if (document.activeElement?.matches('.flower-render-control')) focusTarget.current = 'fallback'
      setError(previewError)
    }
  }

  async function savePostcard() {
    const garden = engine.current
    const seed = activeSeed.current
    if (!garden || !ready) return
    const isCurrent = () => engine.current === garden && activeSeed.current === seed
    setSaveResult(null)
    try {
      const image = await garden.exportPng()
      if (!isCurrent()) return
      const url = URL.createObjectURL(image)
      const link = document.createElement('a')
      link.href = url
      link.download = `flowers-for-you-${seed}.png`
      try {
        link.click()
        setSaveResult('downloaded')
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      if (isCurrent()) setSaveResult('failed')
    }
  }

  const kinds = bouquet ? flowerNames.format(bouquet.kinds) : ''
  const date = bouquet ? new Date(bouquet.timestamp) : null

  return (
    <div className="flower-app">
      <main className="flower-layout">
        <header className="flower-intro">
          <a className="flower-home" href={import.meta.env.BASE_URL} aria-label="Flowers for You home">
            <img src={`${import.meta.env.BASE_URL}flowers.svg`} width="29" height="29" alt="" />
          </a>
          <h1>Flowers <em>for You</em></h1>
          <p>{linkStatus === 'valid' ? 'I picked these flowers for you.' : 'Find a bouquet for someone on your mind.'}</p>
          <p className="flower-link-notice" role="status">{linkStatus === 'invalid' ? `This bouquet link couldn’t be opened.${bouquet ? ' There’s a fresh bouquet for you instead.' : ''}` : null}</p>
        </header>

        <section className="flower-postcard" aria-label="Your surprise bouquet">
          <div className="flower-stage">
            <canvas
              id="flower"
              ref={canvas}
              className="flower-canvas"
              data-concealed={sealed || unavailable ? '' : undefined}
              inert={sealed || unavailable}
              tabIndex={sealed || unavailable ? -1 : 0}
              role="img"
              aria-label={kinds ? `A hand-tied bouquet with ${kinds}.` : 'A three-dimensional bouquet.'}
              aria-describedby="flower-turn-instructions"
            />
            {unavailable ? (
              <div className="flower-render-fallback" ref={fallback} tabIndex={-1}>
                <p role="status">
                  {error ?? (shareUrl ? 'The 3D preview paused. You can still send this bouquet.' : 'The 3D preview paused. Wait a moment for it to return.')}
                </p>
                <a href={shareUrl ?? window.location.href}>{shareUrl ? 'Reload this bouquet' : 'Reload the postcard'}</a>
              </div>
            ) : null}
          </div>
          <div className="flower-postcard-details" data-sealed={sealed ? '' : undefined} inert={sealed}>
            <p className="sr-only" role="status">{unavailable ? null : status}</p>
            <div className="flower-stage-controls" data-unavailable={unavailable ? '' : undefined}>
              <p id="flower-turn-instructions" className="sr-only">Drag left or right or use the arrow keys to turn the bouquet. Scroll vertically to move down the page. Press Home or Reset view to return to the front.</p>
              <span aria-hidden="true" className="flower-turn-hint"><span className="flower-pointer-hint">Drag or use arrow keys to turn</span><span className="flower-touch-hint">Drag sideways to turn</span></span>
              <ActionButton
                disabled={!ready}
                onClick={(event) => engine.current?.resetView({ instant: event.detail === 0 || reducedMotion })}
                render={<Button variant="ghost" size="sm" className="flower-control flower-render-control flower-reset" />}
              ><RotateCcw aria-hidden="true" />Reset view</ActionButton>
            </div>
            <div className="flower-card-footer">
              <div className="flower-identity">
                <h2>{bouquet?.name ?? 'Your bouquet'}</h2>
                {date ? <p>Grown on <time dateTime={date.toISOString()}>{dates.format(date)}</time></p> : null}
              </div>
              <ActionButton
                disabled={!ready}
                aria-label="Save postcard as a PNG image"
                pendingAnnouncement="Preparing the postcard image"
                onClick={savePostcard}
                render={<Button variant="outline" className="flower-control flower-render-control flower-save" />}
              >
                <ActionIcon complete={saveResult === 'downloaded'}><ArrowDownToLine /></ActionIcon>
                <span>Save<span className="flower-save-detail"> postcard</span></span>
              </ActionButton>
              <ActionFeedback>{saveResult === 'downloaded' ? 'Postcard download started.' : saveResult === 'failed' ? 'Couldn’t save the postcard. Try downloading it again.' : null}</ActionFeedback>
            </div>
          </div>
          {cover === 'gone' ? null : <GiftCover ready={ready} exiting={cover === 'exiting'} reducedMotion={reducedMotion} onOpen={openFlowers} onExit={dismissCover} />}
        </section>

        <div className="flower-garden" data-sealed={sealed ? '' : undefined} data-pointer-opened={pointerOpened ? '' : undefined} inert={sealed}>
          <ShareFlowers key={shareSeed} url={shareUrl} isCurrent={() => activeSeed.current === shareSeed && canvas.current !== null} />
          <div className="flower-secondary">
            <ActionButton
              disabled={!ready}
              onClick={(event) => growAnother(event.detail === 0)}
              render={<Button variant="ghost" className="flower-control flower-render-control" />}
            ><Sprout aria-hidden="true" />Grow another</ActionButton>
            {reducedMotion ? null : (
              <ActionButton
                disabled={!ready}
                onClick={() => engine.current?.bloom()}
                render={<Button variant="ghost" className="flower-control flower-render-control" />}
              ><RotateCw aria-hidden="true" />Replay bloom</ActionButton>
            )}
          </div>
          {reducedMotion && ready ? <p className="flower-motion-note">Bloom animation is off with your reduced-motion setting.</p> : null}
          {bouquet ? <p className="flower-stem-note">{bouquet.flowerCount} stems with {kinds}</p> : null}
        </div>
        <footer className="flower-app-options" aria-label="App options">
          <SoundToggle enabled={openingSound.enabled} onChange={openingSound.changeEnabled} />
        </footer>
      </main>
    </div>
  )
}
