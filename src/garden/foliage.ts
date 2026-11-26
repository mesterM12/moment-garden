import * as THREE from 'three';
import { ease } from './bloom-score';
import { shadeFoliage, type LeafSkin } from './foliage-shader';
import type { SpeciesKey, Specimen } from './types';

const up = new THREE.Vector3(0, 1, 0);
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const mix = THREE.MathUtils.lerp;
const body = (t: number) => Math.max(0, Math.sin(Math.PI * t));
const bell = (x: number) => Math.exp(-x * x);

const netted = 0, basal = 1, parallel = 2, thread = 3, collecting = 4;
const skins = {
  rose: [netted, .49, .16, .25],
  dahlia: [netted, .66, .20, .31],
  sunflower: [basal, .82, .20, .38],
  hydrangea: [netted, .62, .19, .30],
  anemone: [basal, .67, .23, .31],
  ranunculus: [basal, .51, .25, .28],
  poppy: [netted, .79, .19, .32],
  daisy: [netted, .67, .23, .26],
  tulip: [parallel, .57, .17, .24],
  iris: [parallel, .62, .15, .22],
  lily: [parallel, .49, .21, .23],
  billyButton: [parallel, .77, .18, .26],
  orchid: [parallel, .35, .09, .20],
  calla: [collecting, .43, .21, .25],
  cosmos: [thread, .73, .17, .24],
} satisfies Record<SpeciesKey, LeafSkin>;

export function foliageMaterial(key: SpeciesKey) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .76 });
  material.onBeforeCompile = shader => shadeFoliage(shader, skins[key]);
  material.customProgramCacheKey = () => 'foliage/skin-1';
  return material;
}

// One indexed mesh per socket, including the petiole and all its divisions.
// There are no separately drawn veins, sleeves, or leaflet meshes.
class LeafMesh {
  private positions: number[] = [];
  private pigments: number[] = [];
  private tissue: number[] = [];
  private indices: number[] = [];

  private vertex(p: THREE.Vector3, c: THREE.Color, s: number, t: number, hand: number) {
    const i = this.positions.length / 3;
    this.positions.push(p.x, p.y, p.z);
    this.pigments.push(c.r, c.g, c.b);
    this.tissue.push(s, t, hand);
    return i;
  }

  patch(rows: number, across: number, hand: number, sample: (t: number, s: number) => [THREE.Vector3, THREE.Color], collapseBase = false) {
    const rings: number[][] = [];
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const steps = i === rows || (!i && collapseBase) ? 0 : across;
      const ring: number[] = [];
      for (let j = 0; j <= steps; j++) {
        const s = steps ? 2 * j / steps - 1 : 0;
        ring.push(this.vertex(...sample(t, s), s, t, hand));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rows; i++) {
      const a = rings[i], b = rings[i + 1];
      for (let j = 0; j < across; j++) {
        if (a.length > 1) this.indices.push(a[j], b[Math.min(j, b.length - 1)], a[j + 1]);
        if (b.length > 1) this.indices.push(b[j], b[j + 1], a[Math.min(j + 1, a.length - 1)]);
      }
    }
  }

  stalk(curve: THREE.Curve<THREE.Vector3>, sections: number, start: number, end: number, color: THREE.Color) {
    const sides = 5, offset = this.positions.length / 3;
    const frames = curve.computeFrenetFrames(sections, false);
    const tint = new THREE.Color();
    for (let i = 0; i <= sections; i++) {
      const t = i / sections, radius = mix(start, end, t), p = curve.getPointAt(t);
      for (let j = 0; j < sides; j++) {
        const a = j * 2 * Math.PI / sides;
        this.vertex(p.clone().addScaledVector(frames.normals[i], -radius * Math.cos(a))
          .addScaledVector(frames.binormals[i], radius * Math.sin(a)),
        tint.copy(color).multiplyScalar(.90 + .14 * t + .11 * Math.cos(2 * a)), 0, 0, -1);
        if (i < sections) {
          const u = offset + i * sides + j, next = offset + i * sides + (j + 1) % sides;
          this.indices.push(u, u + sides, next, next, u + sides, next + sides);
        }
      }
    }
  }

  finish() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.pigments, 3));
    g.setAttribute('leafTissue', new THREE.Float32BufferAttribute(this.tissue, 3));
    g.setIndex(this.indices);
    g.computeVertexNormals();
    return g;
  }
}

type Form = 'ovate' | 'toothed' | 'heart' | 'arrow' | 'lobed' | 'lance' | 'thread';
type Blade = {
  form: Form; root: THREE.Vector3; tip: THREE.Vector3; width: number; rows: number; across: number;
  arch: number; fold: number; twist?: number;
};

class Foliage {
  readonly mesh = new LeafMesh();
  private root: THREE.Color;
  private flesh: THREE.Color;
  readonly stalk: THREE.Color;
  private tint = new THREE.Color();
  private divisions = 0;

  constructor(hue: number, key: SpeciesKey, private phase: number, private skew: number) {
    const glaucous = key === 'tulip' || key === 'iris' || key === 'poppy';
    const deep = key === 'rose' || key === 'orchid' || key === 'calla';
    const h = glaucous ? 130 + (hue - 110) * .39 : hue + (deep ? 3 : -4);
    const sat = glaucous ? 20 : deep ? 39 : 34;
    this.root = new THREE.Color(`hsl(${h + 4}, ${sat}%, ${deep ? 20 : 23}%)`);
    this.flesh = new THREE.Color(`hsl(${h}, ${sat}%, ${glaucous ? 34 : deep ? 28 : 32}%)`);
    this.stalk = new THREE.Color(`hsl(${h - 13}, ${sat}%, ${deep ? 32 : 36}%)`);
  }

  private hand() {
    return (this.phase / (2 * Math.PI) + this.divisions++ * .61803398875) % 1;
  }

  private color(t: number, s: number) {
    return this.tint.copy(this.root).lerp(this.flesh, .32 + .68 * ease(t / .42))
      .multiplyScalar(1 - .10 * Math.abs(s) ** 3 + .09 * s * Math.sin(this.phase + 3 * t));
  }

  blade({ form, root, tip, width, rows, across, arch, fold, twist = 0 }: Blade) {
    const axis = tip.clone().sub(root);
    const along = axis.clone().normalize();
    const side = up.clone().cross(along).normalize(), normal = along.clone().cross(side).normalize();
    const p = new THREE.Vector3(), cross = new THREE.Vector3(), dorsal = new THREE.Vector3();
    const broadBase = form === 'heart' || form === 'arrow';
    this.mesh.patch(rows, across, this.hand(), (t, s) => {
      const span = body(t ** (broadBase ? .69 : form === 'lance' ? .80 : .87));
      const envelope = span ** (form === 'lance' || form === 'thread' ? .84 : .70);
      const tooth = (phase: number, count: number) => 1 - Math.abs(2 * ((t * count + phase) % 1) - 1);
      const teeth = form === 'toothed' || form === 'heart' ? .125 * tooth(s < 0 ? .18 : 0, 7)
        : form === 'lobed' ? .52 * tooth(s < 0 ? .30 : 0, 4) : 0;
      const skew = this.skew * (t * .075 + .11 * Math.sin(4.2 * t));
      const shoulder = broadBase ? .48 * (1 - ease(t / .35)) : 0;
      const w = width * (envelope + shoulder) * (1 - teeth * (1 - shoulder)) * (1 + .12 * s * this.skew);
      // A notched basal edge joins the petiole between two rounded shoulders.
      const sinus = broadBase ? s * s * (1 - ease(t / .44)) * (form === 'arrow' ? .24 : .135) : 0;
      const foldY = -fold * (.78 * Math.abs(s) + .22 * s * s) * (envelope + shoulder);
      const midrib = .062 * width * bell(s * 9) * envelope;
      const wave = .11 * width * s ** 3 * Math.sin(this.phase + t * 12) * envelope;
      cross.copy(side).applyAxisAngle(along, t * twist);
      dorsal.copy(normal).applyAxisAngle(along, t * twist);
      p.copy(root).addScaledVector(axis, t - sinus).addScaledVector(cross, w * (s + skew))
        .addScaledVector(dorsal, arch * body(t) + foldY + midrib + wave);
      return [p, this.color(t, s)];
    }, !broadBase);
  }

  clasp(length: number, width: number) {
    // The leaf starts as a gutter around the stem. Both upturned margins
    // open into a wide, folded lamina. Its root is part of the same surface.
    const p = new THREE.Vector3();
    this.mesh.patch(22, 8, this.hand(), (t, s) => {
      const collar = 1 - ease(t / .25), bay = body(t ** .72);
      const arc = s * mix(.83, 2.12, collar);
      const w = mix(width * bay ** .76, .051, collar);
      const y = length * (t - .18 * t ** 3) + .10 * s * s * collar;
      const reach = .022 + length * (.26 * t ** 1.35 + .20 * t ** 3);
      const roll = (.32 + .24 * this.skew) * ease(t / .76);
      const x = w * Math.sin(arc), z = -w * (1 - Math.cos(arc)) * .88;
      p.set(x * Math.cos(roll) + z * Math.sin(roll) + this.skew * .12 * t * t, y,
        reach + z * Math.cos(roll) - x * Math.sin(roll));
      return [p, this.color(t, s)];
    });
  }
}

// These are the existing per-leaf draws (length, breadth, flare, phase).
// Species vary their construction here without advancing the specimen RNG.
type Variation = readonly [length: number, width: number, flare: number, phase: number];

function buildGeometry(specimen: Specimen, [length, width, flare, phase]: Variation) {
  const { key, greenHue } = specimen;
  const f = new Foliage(greenHue, key, phase * Math.PI * 2, 2 * flare - 1);
  const L = 1 + .20 * length, W = .9 + .20 * width;
  const origin = v(0, 0, 0);
  const stalk = (a: THREE.Vector3, b: THREE.Vector3, r: number, end: number, n: number, arch = 0) => {
    const curve = new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, .53).add(v(0, arch, 0)), b);
    f.mesh.stalk(curve, n, r, end, f.stalk);
    return curve;
  };

  if (key === 'tulip') {
    f.clasp(1.58 * L, .24 * W);
  } else if (key === 'rose' || key === 'dahlia') {
    const rose = key === 'rose', count = rose ? 2 : 1;
    const rachis = new THREE.QuadraticBezierCurve3(origin, v(.035, .17, .31 * L), v(.04, .05, .83 * L));
    f.mesh.stalk(rachis, 6, .028, .008, f.stalk);
    f.blade({ form: 'toothed', root: rachis.getPoint(.985), tip: v(.04, -.025, (rose ? 1.40 : 1.38) * L),
      width: (rose ? .158 : .213) * W, arch: .076, fold: .060, rows: 21, across: 4, twist: .24 });
    for (let i = 0; i < count; i++) for (const side of [-1, 1]) {
      const a = rachis.getPoint((rose ? .32 + .34 * i : .51) + .041 * side);
      const b = a.clone().add(v(side * (.078 - .016 * i), .006, .060 * L));
      stalk(a, b, .012, .007, 2, .016);
      f.blade({ form: 'toothed', root: b, tip: b.clone().add(v(side * (rose ? .33 + .045 * i : .41) * W, -.08, (.28 + .085 * i) * L)),
        width: (rose ? .111 + .02 * i : .17) * W, arch: .049, fold: .048, rows: 15, across: 4, twist: side * (.26 + .13 * flare) });
    }
  } else if (key === 'cosmos') {
    const rachis = new THREE.QuadraticBezierCurve3(origin, v(.032, .15, .43 * L), v(-.014, -.02, 1.32 * L));
    f.mesh.stalk(rachis, 6, .020, .003, f.stalk);
    for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
      const a = rachis.getPoint(.20 + i * .179 + side * .018), span = (.36 - .044 * i) * W;
      const b = a.clone().add(v(side * span, -.048, (.32 - .03 * i) * L));
      const branch = stalk(a, b, .010, .0025, 3, .03);
      for (const hand of [-1, 1]) {
        const root = branch.getPointAt(hand < 0 ? 1 / 3 : 2 / 3);
        const tip = root.clone().add(v(side * (hand < 0 ? .23 : .09) * W, .026 * hand, (.13 + hand * .06) * L));
        f.blade({ form: 'thread', root, tip, width: .018 * W, arch: .021, fold: .012, rows: 5, across: 2 });
      }
      f.blade({ form: 'thread', root: branch.getPointAt(2 / 3), tip: b.clone().add(v(side * .11, -.025, .095)),
        width: .018 * W, arch: .02, fold: .012, rows: 5, across: 2 });
    }
    f.blade({ form: 'thread', root: rachis.getPoint(.87), tip: v(-.042, -.064, 1.47 * L),
      width: .023 * W, arch: .033, fold: .018, rows: 6, across: 2 });
  } else {
    // Each leaf is drawn at bouquet scale, not the full basal foliage of a plant.
    // The species that share a family still differ in reach, width or insertion.
    const profiles = {
      sunflower: ['heart', .40, 1.40, .325, .09, -.17, .074],
      hydrangea: ['toothed', .20, 1.22, .286, .10, -.08, .064],
      calla: ['arrow', .32, 1.30, .31, .10, .01, .08],
      poppy: ['lobed', .13, 1.07, .235, .11, -.07, .043],
      ranunculus: ['lobed', .29, 1.05, .273, .13, .004, .062],
      anemone: ['lobed', .21, 1.22, .235, .12, -.03, .064],
      lily: ['lance', .06, 1.24, .125, .13, -.13, .042],
      daisy: ['toothed', .12, .94, .116, .076, -.09, .042],
      billyButton: ['lance', .08, .87, .086, .092, -.08, .032],
      iris: ['lance', .04, 1.63, .116, .30, .07, .114],
      orchid: ['ovate', .07, 1.57, .206, .24, -.08, .077],
    } as const;
    const [form, petiole, reach, breadth, arch, dip, fold] = profiles[key];
    const root = v(0, .045 * petiole / .4, petiole * L);
    const twigR = key === 'sunflower' ? .036 : .027;
    // Push the petiole a fraction into the lamina so the junction doesn't
    // hinge around an isolated mathematical point when seen from underneath.
    stalk(origin, root.clone().add(v(0, .01, .048)), twigR, .011, 5, .045);
    f.blade({ form, root, tip: v(.057 * (flare - .5), dip, reach * L), width: breadth * W, arch, fold,
      rows: form === 'toothed' || form === 'heart' || form === 'lobed' ? 28 : 18, across: 8, twist: .32 * (flare - .24) });
  }
  return f.mesh.finish();
}

/** Socket positions still sample the routed stem; the mesh remains the only child. */
export class StemLeaf extends THREE.Group {
  yaw: number;
  private readonly clasped: boolean;
  private readonly tangent = new THREE.Vector3();
  private readonly posedTangent = new THREE.Vector3();
  private flexSlope = 0;

  constructor(specimen: Specimen, variation: Variation, bladePitch: number, yaw: number, material: THREE.Material,
    private readonly bend: THREE.Vector3) {
    super();
    this.yaw = yaw;
    this.clasped = specimen.key === 'tulip';
    const blade = new THREE.Mesh(buildGeometry(specimen, variation), material);
    blade.rotation.x = this.clasped ? 0 : bladePitch;
    this.add(blade);
  }

  socket(curve: THREE.CatmullRomCurve3, t: number) {
    this.position.copy(curve.getPoint(t));
    if (this.clasped) {
      curve.getTangent(t, this.tangent);
      const height = curve.points[curve.points.length - 1].y + 1.9;
      const h = THREE.MathUtils.clamp((this.position.y + 1.9) / height, 0, 1);
      // Slope of flexAt along this stem, cached at the chosen socket.
      this.flexSlope = 6 * h * (1 - h) * this.tangent.y / height;
    }
  }

  orient(pitch: number, tension = 0) {
    if (this.clasped) {
      // Unfurl around the posed stem rather than peeling the collar off it.
      this.posedTangent.copy(this.tangent).addScaledVector(this.bend, this.flexSlope * tension).normalize();
      this.quaternion.setFromUnitVectors(up, this.posedTangent);
      this.rotateY(this.yaw + .43 * (.8 - pitch));
    } else {
      this.rotation.set(pitch, this.yaw, 0);
    }
  }
}
