import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '../styles/globals.css'
import { publicPath } from '../lib/site'
import { OfflineRegistration } from '../pwa/OfflineRegistration'

export const metadata: Metadata = {
  title: 'Flowers for You',
  description: 'Send flowers to someone you love. A little bouquet to open, watch bloom, and keep.',
  applicationName: 'Flowers for You',
  appleWebApp: { capable: true, title: 'Flowers for You', statusBarStyle: 'default' },
  icons: { icon: publicPath('flowers.svg'), apple: [{ url: publicPath('icons/apple-touch-icon.png'), sizes: '180x180' }] },
  manifest: publicPath('manifest.webmanifest'),
}

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content',
  themeColor: '#f5e9e2', colorScheme: 'light',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <OfflineRegistration />
        <noscript><p className="flower-no-script">These flowers need JavaScript to bloom. Turn it on, then reload this page.</p></noscript>
      </body>
    </html>
  )
}
