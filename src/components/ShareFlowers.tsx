import { Button as ActionButton } from '@ui-sdk/react/button'
import { Field, FieldDescription, FieldLabel } from '@ui-sdk/react/field'
import { Input } from '@ui-sdk/react/input'
import { Share } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { ActionFeedback, ActionIcon } from './ActionFeedback'
import { Button } from './ui/button'

type ShareResult = 'copied' | 'shared' | 'canceled' | 'manual' | null

interface ShareFlowersProps {
  url: string | null
  isCurrent: () => boolean
}

export function ShareFlowers({ url, isCurrent }: ShareFlowersProps) {
  const [result, setResult] = useState<ShareResult>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    if (result !== 'manual' || !input.current) return
    const active = document.activeElement
    if (active === document.body || active === opener.current) {
      input.current.focus()
      input.current.select()
    }
  }, [result])

  async function sendFlowers() {
    if (!url) return
    setResult(null)
    const data = { title: 'Flowers for You', text: 'I picked these flowers for you.', url }
    try {
      if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(data))) {
        await navigator.share(data)
        if (isCurrent()) setResult('shared')
        return
      }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
        if (isCurrent()) setResult('canceled')
        return
      }
    }

    if (!isCurrent()) return
    try {
      await navigator.clipboard.writeText(url)
      if (isCurrent()) setResult('copied')
    } catch {
      if (isCurrent()) setResult('manual')
    }
  }

  return (
    <div className="flower-share">
      <ActionButton
        ref={opener}
        disabled={!url}
        onClick={sendFlowers}
        pendingAnnouncement="Opening sharing options"
        data-agent-confirm="Opens sharing options for this bouquet"
        render={<Button size="lg" className="flower-control flower-primary flower-send" />}
      >
        <ActionIcon complete={result === 'copied' || result === 'shared'}><Share /></ActionIcon>
        Send flowers
      </ActionButton>
      <ActionFeedback>
        {!url ? 'Open this postcard on a website to share its link.' :
          result === 'copied' ? 'Bouquet link copied.' :
          result === 'shared' ? 'Link handed to your share app.' :
          result === 'canceled' ? 'Sharing canceled.' :
          result === 'manual' ? 'Copy the bouquet link below.' : null}
      </ActionFeedback>
      {result === 'manual' && url ? (
        <Field className="flower-manual-share">
          <FieldLabel>Bouquet link</FieldLabel>
          <Input
            className="flower-link-field"
            ref={input}
            type="url"
            value={url}
            readOnly
            inputMode="none"
            onFocus={(event) => event.currentTarget.select()}
          />
          <FieldDescription>Anyone with this link can open this same bouquet.</FieldDescription>
        </Field>
      ) : null}
    </div>
  )
}
