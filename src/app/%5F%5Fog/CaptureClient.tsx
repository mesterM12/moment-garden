'use client'

import dynamic from 'next/dynamic'

const Capture = dynamic(() => import('../../social/SocialCapture'), { ssr: false })
export function CaptureClient() {
  return <Capture />
}
