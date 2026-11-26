// Control nets from the original silk engraving, in the plate's 380 × 198 units.
const pieces = [
  ['left-tail', 'tail', -1, 'M181 73C151 82 145 100 134 120C117 149 97 156 68 155L45 185L75 178L81 190C127 185 138 160 156 134C169 114 173 102 194 88Z', 'M79 186C119 181 134 153 149 131M74 159C99 162 123 143 135 123'],
  ['right-tail', 'tail', 1, 'M187 78C209 79 224 90 241 110C261 135 281 145 313 140C327 138 341 134 352 125L348 144L364 149C345 165 324 172 298 172C262 171 241 150 221 126C206 109 196 102 178 96Z', 'M204 99C229 112 238 145 271 159C298 171 325 166 351 154M217 94C244 112 252 143 289 148'],
  ['left-lining', 'lining', -1, 'M181 73C153 88 104 103 65 90C48 84 40 74 40 61C41 42 47 31 53 22C59 30 62 43 70 48C99 65 141 63 181 73Z', 'M56 82C82 99 131 90 164 80'],
  ['left-loop', 'loop', -1, 'M184 72C148 54 123 25 89 15C70 10 59 12 52 21C45 30 43 45 40 61C48 47 63 49 83 52C124 58 145 79 180 86Z', 'M45 48C51 32 64 31 87 36M45 51C52 39 70 40 88 43M84 15C122 23 148 56 174 68'],
  ['right-lining', 'lining', 1, 'M185 74C218 63 264 44 295 34C308 30 314 23 315 12C325 25 326 46 322 61C316 84 293 95 268 96C237 97 210 92 189 87Z', 'M203 88C257 99 296 94 314 73'],
  ['right-loop', 'loop', 1, 'M183 71C213 50 238 21 268 9C287 2 305 1 315 12C325 24 325 42 323 54C321 42 310 39 297 40C262 41 228 69 191 83Z', 'M197 67C233 44 261 14 293 10M204 76C238 60 268 37 295 34C307 33 317 36 321 43'],
  ['knot', 'knot', 1, 'M172 66C180 60 194 58 202 65C206 69 204 75 202 82C200 89 199 95 192 97C184 99 172 96 169 89C168 84 173 76 172 66Z', 'M174 84C177 76 178 69 177 67M198 70C197 78 195 86 191 92M187 64C185 68 185 74 184 79'],
] as const

type Net = { command: string; points: number[] }[]
const compile = (path: string): Net => Array.from(path.matchAll(/([MCLZ])([\d .-]*)/g), ([, command, values]) => ({ command, points: values ? values.trim().split(/\s+/).map(Number) : [] }))
export const cloth = pieces.map(([id, face, side, shape, selvedge]) => ({ id, face, side, shape, selvedge, body: compile(shape), edge: compile(selvedge) }))
type Piece = typeof cloth[number]
export type Side = -1 | 1
export type Pull = { side: Side; dx: number; dy: number; grip: number }
export const resting: Pull = { side: 1, dx: 0, dy: 0, grip: 130 }
const unit = (x: number) => Math.min(1, Math.max(0, x))
const fmt = (x: number) => Math.round(x * 10) / 10
const TAU = 2 * Math.PI

// After slipping, each half is still one continuous length from the wrapping band to its cut end.
function root(side: Side, loose: number) {
  return { x: side * 275 * loose ** 1.55, y: 45 * loose + 17 * Math.sin(loose * Math.PI) }
}

function cut(piece: Piece, pull: Pull, loose: number) {
  const taking = piece.side === pull.side
  const tension = unit(Math.abs(pull.dx) / 112)
  const anchor = root(piece.face === 'knot' ? pull.side : piece.side, loose)
  return (net: Net) => net.map(({ command, points }) => {
    let line = command
    for (let i = 0; i < points.length; i += 2) {
      const u = points[i] - 186, v = points[i + 1] - 80
      const reach = unit(u * piece.side / 142)
      let x = u, y = v
      if (piece.face === 'knot') {
        x = u * (1 - .33 * tension + .85 * loose) + v * pull.side * (.19 * tension + .65 * loose)
        y = v * (1 + .12 * tension - .94 * loose)
      } else if (piece.face === 'tail') {
        const grip = unit(u * piece.side / pull.grip)
        const belly = Math.sin(grip * Math.PI)
        x += taking ? pull.dx * grip : piece.side * (12 * reach - 16 * belly) * tension
        y += taking ? pull.dy * grip - 39 * belly * tension : (20 * reach + 12 * belly) * tension
        // A single travelling fold runs from the released throat to the cut edge.
        y += loose * (-.58 * v + 36 * reach) + 45 * Math.sin(TAU * (loose - .6 * reach)) * Math.sin(loose * Math.PI) * reach
      } else {
        const draw = taking ? .94 * tension : .22 * tension
        const collapse = draw + (1 - draw) * loose
        x *= 1 - collapse * .99
        y = v * (1 - .91 * collapse) + reach * ((taking ? 24 : -17) * tension * (1 - loose) + 18 * loose)
        y += (piece.face === 'lining' ? 15 : -11) * Math.sin(Math.PI * collapse) * reach
      }
      line += `${i ? ' ' : ''}${fmt(186 + anchor.x + x)} ${fmt(80 + anchor.y + y)}`
    }
    return line
  }).join('')
}

export function bandPath(side: Side, loose: number) {
  const anchor = root(side, loose)
  const end = 186 + side * 650
  // The band is engraved horizontal, then turned seven degrees onto the paper.
  const angle = 7 * Math.PI / 180
  const x = 186 + anchor.x * Math.cos(angle) - anchor.y * Math.sin(angle)
  const y = 80 + anchor.x * Math.sin(angle) + anchor.y * Math.cos(angle)
  return `M${end} 80C${end - side * 140} ${80 + 30 * loose} ${x + side * 92} ${y + 65 * Math.sin(loose * Math.PI)} ${fmt(x)} ${fmt(y)}`
}

export function bindCloth(svg: SVGSVGElement) {
  const parts = cloth.map(piece => {
    const group = svg.querySelector<SVGGElement>(`[data-piece="${piece.id}"]`)!
    return { piece, body: group.querySelector('path')!, edge: group.querySelector('path:last-child')! }
  })
  const bands = svg.querySelectorAll<SVGPathElement>('[data-band]')
  const light = svg.querySelector<SVGLinearGradientElement>('#parcel-loop')!
  let lastLoose = 0
  return (pull: Pull, loose = 0) => {
    for (const { piece, body, edge } of parts) {
      const warp = cut(piece, pull, loose)
      body.setAttribute('d', warp(piece.body))
      edge.setAttribute('d', warp(piece.edge))
    }
    light.setAttribute('x2', String(.28 + pull.side * (.54 * unit(Math.abs(pull.dx) / 112) - .46 * loose)))
    if (loose !== lastLoose) {
      bands.forEach((band, i) => band.setAttribute('d', bandPath(i ? 1 : -1, loose)))
      lastLoose = loose
    }
  }
}
