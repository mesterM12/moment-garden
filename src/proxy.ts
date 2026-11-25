import { NextResponse, type NextRequest } from 'next/server'
import { BASE_PATH } from './lib/site'

export function proxy(request: NextRequest) {
  const url = new URL(request.url)
  if (BASE_PATH && url.pathname === BASE_PATH) {
    url.pathname = `${BASE_PATH}/`
    return NextResponse.redirect(url, 308)
  }
  return NextResponse.next()
}

export const config = { matcher: ['/'] }
