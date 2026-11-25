import { Check, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'

export function ActionIcon({ children, complete }: { children: ReactNode; complete: boolean }) {
  return (
    <span className="flower-action-icon" data-complete={complete ? '' : undefined} aria-hidden="true">
      <span className="flower-action-icon-idle">{children}</span>
      <Check className="flower-action-icon-check" />
      <LoaderCircle className="flower-action-icon-pending" />
    </span>
  )
}

export function ActionFeedback({ children }: { children: ReactNode }) {
  return <p className="flower-action-feedback" role="status">{children}</p>
}
