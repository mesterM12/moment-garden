import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

declare global { var __UI_SDK_STRICT__: boolean | undefined }
globalThis.__UI_SDK_STRICT__ = true
HTMLElement.prototype.showPopover = function () {}
HTMLElement.prototype.hidePopover = function () {}
Element.prototype.getAnimations = () => []
Element.prototype.scrollIntoView = function () {}
Element.prototype.checkVisibility = () => true
Element.prototype.getClientRects = () => [] as unknown as DOMRectList
document.elementFromPoint = () => null
document.elementsFromPoint = () => []
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent: () => true,
  })),
})
Object.defineProperty(URL, 'createObjectURL', { writable: true, value: () => 'blob:postcard' })
Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: () => {} })
document.head.append(Object.assign(document.createElement('style'), {
  textContent: '[popover] { display: block !important }',
}))
afterEach(cleanup)
