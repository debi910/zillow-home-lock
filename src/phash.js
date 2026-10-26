// Perceptual photo matching, so a stolen photo still matches after it's been
// cropped, brightened, recolored, recompressed or stamped with text.
//
// Each photo becomes a small grayscale thumbnail, normalized to zero mean and
// unit variance (which cancels brightness and contrast edits). Archive photos
// are sampled at several crops and offsets, so a cropped copy lines up with
// one of them. Similarity is the normalized cross-correlation (1 = identical).

export const SIZE = 24;
export const MATCH_THRESHOLD = 0.92;

export function normalize(gray) {
  const n = gray.length;
  const mean = gray.reduce((a, b) => a + b, 0) / n;
  let variance = 0;
  for (const g of gray) variance += (g - mean) ** 2;
  const sd = Math.sqrt(variance / n) || 1;
  return gray.map((g) => (g - mean) / sd);
}

export function similarity(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s / a.length;
}

// Crop windows tried on archive photos: [scale, dx, dy] as fractions of the image.
export const WINDOWS = (() => {
  const out = [];
  for (const scale of [1, 0.96, 0.92, 0.88]) {
    const slack = (1 - scale) / 2;
    const steps = slack > 0 ? [-slack, -slack / 2, 0, slack / 2, slack] : [0];
    for (const dx of steps) for (const dy of steps) out.push([scale, dx, dy]);
  }
  return out;
})();

// Browser only: thumbnail an <img> through a crop window.
export function thumbnail(img, [scale, dx, dy] = [1, 0, 0]) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const cw = w * scale;
  const ch = h * scale;
  const x = (w - cw) / 2 + dx * w;
  const y = (h - ch) / 2 + dy * h;
  ctx.drawImage(img, x, y, cw, ch, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return normalize(gray);
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load ${src}`));
    img.src = src;
  });
}

export async function indexArchive(srcs) {
  const out = [];
  for (const src of srcs) {
    const img = await loadImage(src);
    out.push({ src, thumbs: WINDOWS.map((w) => thumbnail(img, w)) });
  }
  return out;
}

export function bestMatch(thumb, archive) {
  let best = null;
  for (const entry of archive) {
    for (const t of entry.thumbs) {
      const score = similarity(thumb, t);
      if (!best || score > best.score) best = { src: entry.src, score };
    }
  }
  return best;
}
