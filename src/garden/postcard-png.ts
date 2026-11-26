import { PerspectiveCamera, Vector3, type Euler } from 'three';

// Use the seeded social card’s 1200 × 630 layout as the print grid, at double resolution.
const scale = 2;
const width = 1200, height = 630;
const card = { x: 30, y: 30, width: 1140, height: 570 };
const stage = { x: 470, y: 38, width: 692, height: 554 };
const colors = { page: '#f5e9e2', paper: '#fff9f2', ink: '#573b3d', rose: '#9a4d5c', muted: '#765b5d', line: '#e7d3ce' };
const date = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const note = ['I picked these flowers', 'for you.'];

async function loaded(fonts: FontFaceSet | undefined, font: string, text: string) {
  if (!fonts) return false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fonts.load(font, text).then(faces => faces.length > 0 && faces.every(face => face.status === 'loaded')),
      new Promise<false>(resolve => { timeout = setTimeout(() => resolve(false), 1000); }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Start with the social card’s full view; back away for wide or tilted silhouettes. */
export function postcardCamera(rotation: Euler, framePoints: readonly Vector3[]) {
  const camera = new PerspectiveCamera(34, stage.width / stage.height, .1, 60);
  camera.position.set(0, 2.15, 12.3);
  camera.lookAt(0, .05, 0);
  camera.updateMatrixWorld();
  const vertical = .86 * Math.tan(camera.fov * Math.PI / 360);
  const horizontal = vertical * camera.aspect;
  const projected = new Vector3();
  let extra = 0;
  for (const point of framePoints) {
    projected.copy(point).applyEuler(rotation).applyMatrix4(camera.matrixWorldInverse);
    // Each point needs depth ≥ max(|x| / tanX, |y| / tanY) inside the padded frustum.
    extra = Math.max(extra, projected.z + Math.abs(projected.x) / horizontal,
      projected.z + Math.abs(projected.y) / vertical);
  }
  camera.translateZ(extra);
  return camera;
}

/** Paint the stationery around a synchronous copy of the transparent WebGL buffer. */
export function createPostcardPng(document: Document) {
  const image = document.createElement('canvas');
  image.width = width * scale;
  image.height = height * scale;
  const ctx = image.getContext('2d');
  if (!ctx) throw new Error('Couldn’t prepare the postcard image.');
  ctx.scale(scale, scale);
  ctx.fillStyle = colors.page;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.shadowColor = '#573b3d24';
  ctx.shadowBlur = 28 * scale;
  ctx.shadowOffsetY = 12 * scale;
  ctx.fillStyle = colors.paper;
  ctx.beginPath();
  ctx.roundRect(card.x, card.y, card.width, card.height, 16);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(stage.x, stage.y, stage.width, stage.height, 12);
  ctx.clip();
  // Match the OG stage’s soft elliptical wash without tinting the flowers.
  ctx.translate(stage.x + .4 * stage.width, stage.y + .36 * stage.height);
  ctx.scale(.6 * stage.width * Math.SQRT2, .64 * stage.height * Math.SQRT2);
  const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  wash.addColorStop(0, '#fffaf0');
  wash.addColorStop(.47, '#f6e8d970');
  wash.addColorStop(.76, '#f6e8d900');
  ctx.fillStyle = wash;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();

  return {
    artwork: { width: stage.width * scale, height: stage.height * scale },
    drawBouquet(canvas: HTMLCanvasElement) {
      ctx.drawImage(canvas, stage.x, stage.y, stage.width, stage.height);
    },
    async encode(name: string, timestamp: number) {
      const savedDate = date.format(timestamp);
      // CSS already declares these same-origin fonts. Missing or slow fonts
      // shouldn't prevent a keepsake, including when saving offline.
      const [serif, italic, sans] = await Promise.all([
        loaded(document.fonts, '88px "Instrument Serif"', `Flowers ${name}`),
        loaded(document.fonts, 'italic 88px "Instrument Serif"', 'for You'),
        loaded(document.fonts, '22px "DM Sans"', [...note, savedDate].join(' ')),
      ]);
      const serifFamily = serif ? '"Instrument Serif", Georgia, serif' : 'Georgia, serif';
      const italicFamily = italic ? '"Instrument Serif", Georgia, serif' : 'Georgia, serif';
      const sansFamily = sans ? '"DM Sans", sans-serif' : 'sans-serif';
      const left = 84, lineWidth = stage.x - left;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = colors.ink;
      ctx.font = `88px ${serifFamily}`;
      ctx.letterSpacing = '-2.2px';
      ctx.fillText('Flowers', left, 156, lineWidth);
      ctx.fillStyle = colors.rose;
      ctx.font = `italic 88px ${italicFamily}`;
      ctx.fillText('for You', left, 242, lineWidth);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = colors.muted;
      ctx.font = `22px ${sansFamily}`;
      note.forEach((line, index) => ctx.fillText(line, left, 304 + 33 * index));

      ctx.fillStyle = colors.line;
      ctx.fillRect(left, 451, lineWidth, 1);
      ctx.fillStyle = colors.ink;
      ctx.font = `36px ${serifFamily}`;
      ctx.letterSpacing = '-.36px';
      ctx.fillText(name, left, 508, lineWidth);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = colors.muted;
      ctx.font = `16px ${sansFamily}`;
      ctx.fillText(savedDate, left, 545);

      return new Promise<Blob>((resolve, reject) => {
        image.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed.')), 'image/png');
      });
    },
  };
}
