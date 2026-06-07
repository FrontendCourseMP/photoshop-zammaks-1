export type InterpolationMethod = 'nearest' | 'bilinear';

export interface InterpolationInfo {
  key: InterpolationMethod;
  label: string;
  tooltip: string;
}

export const INTERPOLATION_METHODS: InterpolationInfo[] = [
  {
    key: 'bilinear',
    label: 'Билинейная',
    tooltip:
      'Усредняет 4 ближайших пикселя с весами пропорционально расстоянию. ' +
      'Даёт плавный результат без пиксельных артефактов. Оптимально для фотографий.',
  },
  {
    key: 'nearest',
    label: 'Ближайший сосед',
    tooltip:
      'Копирует значение ближайшего пикселя без усреднения. ' +
      'Работает быстрее и сохраняет чёткие границы. ' +
      'При увеличении даёт характерный "пиксельный" эффект — удобно для пиксель-арта.',
  },
];

export const SCALE_PRESETS = [12, 25, 33, 50, 66, 75, 100, 150, 200, 300] as const;

// ── Nearest-neighbor ─────────────────────────────────────────────────────────

export function scaleNearest(
  srcData: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  const out = new Uint8Array(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const sy = Math.min(Math.floor(dy * yRatio), srcH - 1);
    const srcRowOff = sy * srcW;

    for (let dx = 0; dx < dstW; dx++) {
      const sx = Math.min(Math.floor(dx * xRatio), srcW - 1);
      const src = (srcRowOff + sx) * 4;
      const dst = (dy * dstW + dx) * 4;
      out[dst]     = srcData[src];
      out[dst + 1] = srcData[src + 1];
      out[dst + 2] = srcData[src + 2];
      out[dst + 3] = srcData[src + 3];
    }
  }
  return out;
}

// ── Bilinear ──────────────────────────────────────────────────────────────────

export function scaleBilinear(
  srcData: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  const out = new Uint8Array(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const fy = (dy + 0.5) * yRatio - 0.5;
    const y0  = Math.max(0, Math.floor(fy));
    const y1  = Math.min(y0 + 1, srcH - 1);
    const yt  = Math.max(0, fy - y0);
    const ym  = 1 - yt;
    const row0 = y0 * srcW;
    const row1 = y1 * srcW;

    for (let dx = 0; dx < dstW; dx++) {
      const fx = (dx + 0.5) * xRatio - 0.5;
      const x0  = Math.max(0, Math.floor(fx));
      const x1  = Math.min(x0 + 1, srcW - 1);
      const xt  = Math.max(0, fx - x0);
      const xm  = 1 - xt;

      const p00 = (row0 + x0) * 4;
      const p10 = (row0 + x1) * 4;
      const p01 = (row1 + x0) * 4;
      const p11 = (row1 + x1) * 4;
      const dst = (dy * dstW + dx) * 4;

      for (let c = 0; c < 4; c++) {
        out[dst + c] = Math.round(
          (srcData[p00 + c] * xm + srcData[p10 + c] * xt) * ym +
          (srcData[p01 + c] * xm + srcData[p11 + c] * xt) * yt,
        );
      }
    }
  }
  return out;
}

// ── Unified API ───────────────────────────────────────────────────────────────

/**
 * Scale `srcData` (RGBA Uint8Array) to dstW × dstH using the selected method.
 * Returns a fresh Uint8Array; srcData is never modified.
 */
export function scaleImage(
  srcData: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  method: InterpolationMethod,
): Uint8Array {
  if (dstW === srcW && dstH === srcH) return new Uint8Array(srcData);
  return method === 'nearest'
    ? scaleNearest(srcData, srcW, srcH, dstW, dstH)
    : scaleBilinear(srcData, srcW, srcH, dstW, dstH);
}

/**
 * Render only the visible portion of the scaled image into a canvas-sized region.
 * Scales just the pixels that would actually appear on screen — efficient at high zoom.
 *
 * Returns Uint8ClampedArray pixels + draw coordinates so the caller can
 * do `ctx.createImageData(drawW, drawH); imgData.data.set(pixels); ctx.putImageData(imgData, drawX, drawY)`.
 */
export function renderScaledToCanvas(
  srcData: Uint8Array,
  srcW: number,
  srcH: number,
  scale: number,
  canvasW: number,
  canvasH: number,
  method: InterpolationMethod,
  panX = 0,
  panY = 0,
): { pixels: Uint8ClampedArray; drawX: number; drawY: number; drawW: number; drawH: number } {
  const empty = { pixels: new Uint8ClampedArray(0), drawX: 0, drawY: 0, drawW: 0, drawH: 0 };
  if (canvasW <= 0 || canvasH <= 0) return empty;

  const scaledW = Math.max(1, Math.round(srcW * scale));
  const scaledH = Math.max(1, Math.round(srcH * scale));

  // Centering offset + pan (may be negative if scaled image exceeds canvas)
  const ox = Math.round((canvasW - scaledW) / 2) + Math.round(panX);
  const oy = Math.round((canvasH - scaledH) / 2) + Math.round(panY);

  // Visible region within the scaled image coordinate space
  const visX0 = Math.max(0, -ox);
  const visY0 = Math.max(0, -oy);
  const visX1 = Math.min(scaledW, canvasW - ox);
  const visY1 = Math.min(scaledH, canvasH - oy);

  const drawW = Math.max(0, visX1 - visX0);
  const drawH = Math.max(0, visY1 - visY0);
  const drawX = Math.max(0, ox);
  const drawY = Math.max(0, oy);

  if (drawW <= 0 || drawH <= 0) return empty;

  const xRatio = srcW / scaledW;
  const yRatio = srcH / scaledH;
  const pixels = new Uint8ClampedArray(drawW * drawH * 4);

  if (method === 'nearest') {
    for (let dy = 0; dy < drawH; dy++) {
      const sy = Math.min(Math.floor((visY0 + dy) * yRatio), srcH - 1);
      const srcRow = sy * srcW;
      for (let dx = 0; dx < drawW; dx++) {
        const sx  = Math.min(Math.floor((visX0 + dx) * xRatio), srcW - 1);
        const src = (srcRow + sx) * 4;
        const dst = (dy * drawW + dx) * 4;
        pixels[dst]     = srcData[src];
        pixels[dst + 1] = srcData[src + 1];
        pixels[dst + 2] = srcData[src + 2];
        pixels[dst + 3] = srcData[src + 3];
      }
    }
  } else {
    // Bilinear — only the visible region
    for (let dy = 0; dy < drawH; dy++) {
      const fy  = ((visY0 + dy) + 0.5) * yRatio - 0.5;
      const y0  = Math.max(0, Math.floor(fy));
      const y1  = Math.min(y0 + 1, srcH - 1);
      const yt  = Math.max(0, fy - y0);
      const ym  = 1 - yt;
      const row0 = y0 * srcW;
      const row1 = y1 * srcW;

      for (let dx = 0; dx < drawW; dx++) {
        const fx  = ((visX0 + dx) + 0.5) * xRatio - 0.5;
        const x0  = Math.max(0, Math.floor(fx));
        const x1  = Math.min(x0 + 1, srcW - 1);
        const xt  = Math.max(0, fx - x0);
        const xm  = 1 - xt;

        const p00 = (row0 + x0) * 4;
        const p10 = (row0 + x1) * 4;
        const p01 = (row1 + x0) * 4;
        const p11 = (row1 + x1) * 4;
        const dst = (dy * drawW + dx) * 4;

        for (let c = 0; c < 4; c++) {
          pixels[dst + c] = Math.round(
            (srcData[p00 + c] * xm + srcData[p10 + c] * xt) * ym +
            (srcData[p01 + c] * xm + srcData[p11 + c] * xt) * yt,
          );
        }
      }
    }
  }

  return { pixels, drawX, drawY, drawW, drawH };
}

/**
 * Calculate the scale needed to fit an image into a container with given padding.
 * Result is clamped to [0.12, 3.0].
 */
export function calcFitScale(
  imgW: number,
  imgH: number,
  containerW: number,
  containerH: number,
  padding = 50,
): number {
  if (containerW <= 0 || containerH <= 0 || imgW <= 0 || imgH <= 0) return 1.0;
  const scale = Math.min(
    (containerW - padding * 2) / imgW,
    (containerH - padding * 2) / imgH,
  );
  return Math.max(0.12, Math.min(3.0, scale));
}
