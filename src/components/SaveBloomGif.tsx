import { Button as ActionButton } from '@ui-sdk/react/button'
import { Film } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { exportBloomGif } from '../garden/bloom-gif'
import { formatToken, type Gift } from '../lib/bouquet-link'
import { ActionFeedback, ActionIcon } from './ActionFeedback'
import { Button } from './ui/button'

export function SaveBloomGif({ gift, ready, isCurrent }: { gift: Gift; ready: boolean; isCurrent: () => boolean }) {
  const [result, setResult] = useState<'downloaded' | 'failed' | 'canceled' | null>(null)
  const [running, setRunning] = useState(false)
  const active = useRef<AbortController | null>(null)
  const save = useRef<HTMLButtonElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => () => {
    const job = active.current
    active.current = null
    job?.abort()
  }, [])

  useLayoutEffect(() => {
    if (!ready && active.current) {
      active.current.abort()
      setResult('canceled')
    }
  }, [ready])

  async function saveBloom() {
    if (!ready || active.current || !isCurrent()) return
    const job = new AbortController()
    active.current = job
    setRunning(true)
    setResult(null)
    try {
      const image = await exportBloomGif(document, gift, job.signal)
      if (job.signal.aborted || !isCurrent()) return
      const url = URL.createObjectURL(image)
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = `flowers-for-you-${formatToken(gift)}.gif`
        link.click()
        setResult('downloaded')
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      if (!job.signal.aborted && isCurrent()) setResult('failed')
    } finally {
      if (active.current === job) {
        active.current = null
        if (cancel.current && document.activeElement === cancel.current) save.current?.focus({ preventScroll: true })
        setRunning(false)
      }
    }
  }

  return (
    <>
      <ActionButton
        ref={save}
        disabled={!ready}
        pendingAnnouncement="Preparing the bloom GIF"
        onClick={saveBloom}
        render={<Button variant="ghost" className="flower-control flower-render-control" />}
      ><ActionIcon complete={result === 'downloaded'}><Film /></ActionIcon>Save bloom GIF</ActionButton>
      {running && ready ? (
        <ActionButton
          ref={cancel}
          onClick={() => {
            active.current?.abort()
            setResult('canceled')
          }}
          render={<Button variant="ghost" className="flower-control flower-render-control" />}
        >Cancel GIF export</ActionButton>
      ) : null}
      <ActionFeedback>
        {result === 'downloaded' ? 'Bloom GIF download started.' :
          result === 'failed' ? 'Couldn’t save the bloom GIF. Try again, or save the postcard image instead.' :
          result === 'canceled' ? 'GIF export canceled.' : null}
      </ActionFeedback>
    </>
  )
}
