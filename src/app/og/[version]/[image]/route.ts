import { read as readBouquet } from '../../../../lib/bouquet-link'
import { isRenderBusyError } from '../../../../../server/images'
import { getRenderVersion, getSocialRuntime } from '../../../../../server/social'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: Promise<{ version: string; image: string }>
}

async function respond(context: RouteContext, head: boolean): Promise<Response> {
  try {
    const { version, image } = await context.params
    const match = /^([a-f0-9]{1,14})\.png$/.exec(image)
    const token = match?.[0] === image ? match[1] : undefined
    if (version.length !== 16 || !/^[a-f0-9]{16}$/.test(version) || !token || readBouquet(`bouquet=${token}`).status !== 'valid' || version !== await getRenderVersion()) {
      return new Response(head ? null : 'Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }
    const headers: Record<string, string> = {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      ETag: `"${version}-${token}"`,
    }
    // HEAD validates the immutable URL but never initializes a browser or queues a render.
    if (head) return new Response(null, { headers })
    const { images } = await getSocialRuntime()
    const bytes = await images.get(version, token)
    headers['Content-Length'] = String(bytes.length)
    return new Response(new Uint8Array(bytes), { headers })
  } catch (error) {
    const busy = isRenderBusyError(error)
    if (!busy) console.error('Social image request failed:', error)
    return new Response(head ? null : busy ? 'Preview renderer is busy. Try again shortly.' : 'Request unavailable. Try again shortly.', {
      status: busy ? 429 : 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '10', 'X-Content-Type-Options': 'nosniff' },
    })
  }
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  return respond(context, false)
}

export async function HEAD(_request: Request, context: RouteContext): Promise<Response> {
  return respond(context, true)
}
