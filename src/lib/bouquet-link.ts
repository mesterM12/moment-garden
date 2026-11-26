const PARAM = 'bouquet'
const TOKEN = /^(v3-)?(0|[1-9a-f][0-9a-f]{0,13})$/
const MAX_TIMESTAMP = 8640000000000000
const isTimestamp = (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP

export type BouquetVersion = 2 | 3
export const FRESH_VERSION = 3
export type Gift = { timestamp: number; version: BouquetVersion }
export type BouquetLinkResult = ({ status: 'valid' } & Gift) | { status: 'invalid' | 'absent' }

/** One canonical token in the query, OG path, disk key and loopback capture. */
export function parseToken(token: string): Gift | null {
  const match = TOKEN.exec(token)
  if (!match || match[0] !== token) return null
  const timestamp = Number.parseInt(match[2], 16)
  return isTimestamp(timestamp) ? { timestamp, version: match[1] ? 3 : 2 } : null
}

export function formatToken({ timestamp, version }: Gift): string {
  return (version === 3 ? 'v3-' : '') + timestamp.toString(16)
}

export function read(search: string): BouquetLinkResult {
  const values = new URLSearchParams(search).getAll(PARAM)
  if (!values.length) return { status: 'absent' }
  const gift = values.length === 1 && parseToken(values[0])
  return gift ? { status: 'valid', ...gift } : { status: 'invalid' }
}

export function create(address: string, timestamp: number, version: BouquetVersion = 2): string | null {
  const url = new URL(address)
  if (!['http:', 'https:'].includes(url.protocol) || !isTimestamp(timestamp) || (version !== 2 && version !== 3)) return null
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  url.searchParams.set(PARAM, formatToken({ timestamp, version }))
  return url.href
}

export function withoutBouquet(address: string): string {
  const url = new URL(address)
  if (!url.searchParams.has(PARAM)) return url.href
  url.searchParams.delete(PARAM)
  return url.href
}
