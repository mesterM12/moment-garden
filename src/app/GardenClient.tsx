'use client'

import dynamic from 'next/dynamic'

// The WebGL garden owns browser-only state; metadata is still rendered on the server.
const Garden = dynamic(() => import('../App'), { ssr: false })

export function GardenClient() {
  return <Garden />
}
