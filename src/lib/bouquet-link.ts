const PARAM = 'bouquet'
const HEX_TOKEN = /^(?:0|[1-9a-f][0-9a-f]{0,13})$/
const MAX_TIMESTAMP = 8640000000000000
const isTimestamp = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP

export type BouquetLinkResult = { status: 'valid'; timestamp: number } | { status: 'invalid' | 'absent' }

export function read(search: string): BouquetLinkResult {
  const values = new URLSearchParams(search).getAll(PARAM)
  if (!values.length) return { status: 'absent' }
  if (values.length !== 1) return { status: 'invalid' }
  const value = values[0]
  const match = HEX_TOKEN.exec(value)
  if (!match || match[0] !== value) return { status: 'invalid' }
  const timestamp = Number.parseInt(value, 16)
  return isTimestamp(timestamp) ? { status: 'valid', timestamp } : { status: 'invalid' }
}

export function create(address: string, timestamp: number): string | null {
  const url = new URL(address)
  if (!['http:', 'https:'].includes(url.protocol) || !isTimestamp(timestamp)) return null
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  url.searchParams.set(PARAM, timestamp.toString(16))
  return url.href
}

export function withoutBouquet(address: string): string {
  const url = new URL(address)
  if (!url.searchParams.has(PARAM)) return url.href
  url.searchParams.delete(PARAM)
  return url.href
}
