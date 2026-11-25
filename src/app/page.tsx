import type { Metadata } from 'next'
import { GardenClient } from './GardenClient'
import { getSocialImageUrl } from '../../server/social'

export const dynamic = 'force-dynamic'

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item)
  }
  const url = await getSocialImageUrl(params)
  const alt = 'Flowers for You — this bouquet, fully bloomed on warm cream stationery.'
  return {
    openGraph: {
      type: 'website', siteName: 'Flowers for You', locale: 'en_US', title: 'Flowers for You',
      description: 'A little something, just for you. Open your flowers and watch them bloom.',
      images: [{ url, secureUrl: url, width: 1200, height: 630, type: 'image/png', alt }],
    },
    twitter: { card: 'summary_large_image', title: 'Flowers for You', description: 'A little something, just for you. Open your flowers and watch them bloom.', images: [{ url, alt }] },
  }
}

export default function Home() {
  return <GardenClient />
}
