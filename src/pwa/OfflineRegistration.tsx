'use client'

import { useEffect } from 'react'
import { registerOfflineApp } from './register'

export function OfflineRegistration() {
  useEffect(() => {
    if (!window.location.pathname.endsWith('/__og')) void registerOfflineApp()
  }, [])
  return null
}
