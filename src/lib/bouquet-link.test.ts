import { describe, expect, it } from 'vitest'
import { create, read, withoutBouquet } from './bouquet-link'

const timestamp = 1748091600123
const site = 'https://example.com/moment-garden/'

describe('React bouquet link contract', () => {
  it('restores the same timestamp at a deployed subpath', () => {
    const address = create(`${site}?tracking=1#view`, timestamp)!
    expect(address).toBe(`${site}?bouquet=1970260fcfb`)
    expect(read(new URL(address).search)).toEqual({ status: 'valid', timestamp })
  })
  it('distinguishes missing, malformed, duplicate, and valid seeds', () => {
    expect(read('')).toEqual({ status: 'absent' })
    for (const search of ['?bouquet=', '?bouquet=00', '?bouquet=G', '?bouquet=1&bouquet=2', '?bouquet=ffffffffffffff']) {
      expect(read(search)).toEqual({ status: 'invalid' })
    }
    expect(read('?bouquet=0')).toEqual({ status: 'valid', timestamp: 0 })
  })
  it('removes the bouquet without removing other query parameters', () => {
    expect(withoutBouquet(`${site}?bouquet=123&other=1#here`)).toBe(`${site}?other=1#here`)
  })
  it('does not create local or invalid seed links', () => {
    expect(create('file:///index.html', timestamp)).toBeNull()
    expect(create(site, -1)).toBeNull()
    expect(create(site, 1.5)).toBeNull()
  })
})
