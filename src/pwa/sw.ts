/// <reference lib="webworker" />

import { setCacheNameDetails } from 'workbox-core'
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope

setCacheNameDetails({ prefix: 'flowers-for-you', suffix: self.registration.scope })

// Workbox revisions every shell asset and removes stale entries only on activation.
// A replacement worker waits for all old tabs to close; it never interrupts a gift.
precacheAndRoute(self.__WB_MANIFEST)

const home = new URL('./', self.registration.scope)
const shell = new URL('index.html', home)
registerRoute(
  ({ request, url }) => request.mode === 'navigate'
    && url.origin === home.origin
    && (url.pathname === home.pathname || url.pathname === shell.pathname),
  createHandlerBoundToURL(shell.href),
)
