import type { Page } from 'playwright'

export const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)]

export function sameBouquetArtwork(page: Page, before: Buffer, after: Buffer) {
  // Text antialiasing can vary by a few pixels between canvas encodes.
  // Compare the bouquet field separately from the lettering.
  return page.evaluate(async ([before, after]) => {
    async function artwork(png: string) {
      const image = new Image()
      image.src = `data:image/png;base64,${png}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width - 940
      canvas.height = image.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, -940, 0)
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data
    }
    const [a, b] = await Promise.all([artwork(before), artwork(after)])
    return a.length === b.length && a.every((value, index) => value === b[index])
  }, [before.toString('base64'), after.toString('base64')])
}
