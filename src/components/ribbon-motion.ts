import { bindCloth, resting, silkFeed, type Pull } from './ribbon-cloth'

type Velocity = { x: number; y: number }
const still: Velocity = { x: 0, y: 0 }

export function mountRibbon(svg: SVGSVGElement, tag: HTMLElement | null) {
  const draw = bindCloth(svg)
  let pose = resting
  let frame = 0
  let lastLoose = 0

  function stop() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }
  function show(next: Pull, loose = 0) {
    const samePose = pose.dx === next.dx && pose.dy === next.dy && pose.grip === next.grip && pose.side === next.side
    pose = next
    if (samePose && loose === lastLoose) return
    lastLoose = loose
    draw(pose, loose)
    if (tag && !loose) tag.style.rotate = `${(pose.side * silkFeed(pose).tension * -5).toFixed(2)}deg`
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
    restore(reduce: boolean, velocity = still) {
      const from = pose
      if (reduce || (!from.dx && !from.dy)) { stop(); show(resting); return }
      // Critically damped silk: preserve release speed, never oscillate across the knot.
      const settle = (distance: number, speed: number, ms: number) => {
        const v = Math.max(-2, Math.min(2, speed))
        return (distance + (v + .043 * distance) * ms) * Math.exp(-.043 * ms)
      }
      play(240, t => show(t === 1 ? resting : { ...from, dx: settle(from.dx, velocity.x, t * 240), dy: settle(from.dy, velocity.y, t * 240) }))
    },
    release(outwardSpeed = 0) {
      const from = pose
      const full = from.side * Math.max(126, from.side * from.dx)
      const distance = Math.abs(full - from.dx)
      const drawThrough = Math.max(32, Math.min(180, distance / Math.max(.72, outwardSpeed)))
      const flutter = 270
      play(drawThrough + flutter, t => {
        const elapsed = t * (drawThrough + flutter)
        const take = Math.min(1, elapsed / drawThrough)
        const loose = Math.max(0, (elapsed - drawThrough) / flutter)
        const ease = take * (2 - take)
        show({ ...from, dx: from.dx + (full - from.dx) * ease, dy: from.dy - 7 * ease }, loose)
      })
      return Math.round(drawThrough)
    },
  }
}
