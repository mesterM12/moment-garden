import { Toggle } from '@ui-sdk/react/toggle'
import { Volume2, VolumeX } from 'lucide-react'
import { Button } from './ui/button'

export function SoundToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <Toggle
      pressed={enabled}
      onPressedChange={onChange}
      render={<Button variant="ghost" size="sm" className="flower-control flower-sound" />}
    >
      {enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      <span className="flower-sound-label">Sound</span>
    </Toggle>
  )
}
