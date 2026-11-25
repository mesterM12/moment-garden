import type { Metadata } from 'next'
import { CaptureClient } from './CaptureClient'

export const metadata: Metadata = { robots: { index: false, follow: false } }
export default function CapturePage() {
  return <CaptureClient />
}
