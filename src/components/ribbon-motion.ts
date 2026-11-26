import { bindCloth, resting, type Pull } from './ribbon-cloth'

export function mountRibbon(svg: SVGSVGElement) {
  const draw = bindCloth(svg)
  let pose = resting
  let frame = 0

  function stop() {
    cancelAnimationFrame(frame)
    frame = 0
  }
  function show(next: Pull, loose = 0) {
    pose = next
    draw(pose, loose)
  }
  function play(duration: number, sample: (t: number) => void) {
    stop()
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration))
      sample(t)
      frame = t < 1 ? requestAnimationFrame(tick) : 0
    }
    frame = requestAnimationFrame(tick)
  }

  return {
    stop,
    catch() { stop(); return pose },
    show,
    restore(reduce: boolean) {
      const from = pose
      if (reduce || (!from.dx && !from.dy)) { stop(); show(resting); return }
      play(180, t => {
        const weight = (1 - t) ** 3
        show({ ...from, dx: from.dx * weight, dy: from.dy * weight })
      })
    },
    release() {
      const from = pose
      const drawThrough = Math.max(50, 215 * (1 - Math.min(1, Math.abs(from.dx) / 112)))
      const full = (Math.sign(from.dx) || from.side) * Math.max(126, Math.abs(from.dx))
      const flutter = 395
      play(drawThrough + flutter, t => {
        const elapsed = t * (drawThrough + flutter)
        const take = Math.min(1, elapsed / drawThrough)
        const loose = Math.max(0, (elapsed - drawThrough) / flutter)
        show({ ...from, dx: from.dx + (full - from.dx) * take, dy: from.dy - 10 * take }, loose)
      })
      return Math.round(drawThrough)
    },
  }
}
