export type EdgeHandling = 'black' | 'white' | 'copy';
export type ConvolutionChannel = 'r' | 'g' | 'b' | 'gray';

export interface KernelPreset {
  name: string;
  kernel: number[][];
}

export const KERNEL_PRESETS: KernelPreset[] = [
  {
    name: 'Тождественное',
    kernel: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    name: 'Повышение резкости',
    kernel: [
      [0, -1,  0],
      [-1,  5, -1],
      [0, -1,  0],
    ],
  },
  {
    name: 'Фильтр Гаусса (3×3)',
    kernel: [
      [1 / 16, 2 / 16, 1 / 16],
      [2 / 16, 4 / 16, 2 / 16],
      [1 / 16, 2 / 16, 1 / 16],
    ],
  },
  {
    name: 'Прямоугольное размытие',
    kernel: [
      [1 / 9, 1 / 9, 1 / 9],
      [1 / 9, 1 / 9, 1 / 9],
      [1 / 9, 1 / 9, 1 / 9],
    ],
  },
  {
    name: 'Прюитт X',
    kernel: [
      [-1, 0, 1],
      [-1, 0, 1],
      [-1, 0, 1],
    ],
  },
  {
    name: 'Прюитт Y',
    kernel: [
      [-1, -1, -1],
      [ 0,  0,  0],
      [ 1,  1,  1],
    ],
  },
];

/**
 * Pad RGBA image by 1 pixel on each side using the given edge strategy.
 * Returns padded data of size (w+2) × (h+2).
 */
export function padImage(
  data: Uint8Array,
  w: number,
  h: number,
  edge: EdgeHandling,
): { padded: Uint8Array; pw: number; ph: number } {
  const pw = w + 2;
  const ph = h + 2;
  const padded = new Uint8Array(pw * ph * 4);
  const fillVal = edge === 'white' ? 255 : 0;

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const pdst = (py * pw + px) * 4;

      if (edge === 'copy') {
        const sx = Math.max(0, Math.min(w - 1, px - 1));
        const sy = Math.max(0, Math.min(h - 1, py - 1));
        const psrc = (sy * w + sx) * 4;
        padded[pdst]     = data[psrc];
        padded[pdst + 1] = data[psrc + 1];
        padded[pdst + 2] = data[psrc + 2];
        padded[pdst + 3] = data[psrc + 3];
      } else {
        const isEdgePx = px === 0 || py === 0 || px === pw - 1 || py === ph - 1;
        if (isEdgePx) {
          padded[pdst]     = fillVal;
          padded[pdst + 1] = fillVal;
          padded[pdst + 2] = fillVal;
          padded[pdst + 3] = 255;
        } else {
          const sx = px - 1;
          const sy = py - 1;
          const psrc = (sy * w + sx) * 4;
          padded[pdst]     = data[psrc];
          padded[pdst + 1] = data[psrc + 1];
          padded[pdst + 2] = data[psrc + 2];
          padded[pdst + 3] = data[psrc + 3];
        }
      }
    }
  }

  return { padded, pw, ph };
}

/**
 * Apply a 3×3 kernel convolution to the selected channels of an RGBA image.
 * Pads the source image by the chosen edge strategy, then convolves.
 * Alpha channel is always copied unchanged.
 */
export function applyKernel(
  data: Uint8Array,
  w: number,
  h: number,
  kernel: number[][],
  activeChannels: Set<ConvolutionChannel>,
  edge: EdgeHandling,
  grayscale: boolean,
): Uint8Array {
  const { padded, pw } = padImage(data, w, h, edge);
  const out = new Uint8Array(data);

  // Determine which RGBA component indices to convolve
  const indices: number[] = [];
  if (grayscale) {
    if (activeChannels.has('gray')) indices.push(0);
  } else {
    if (activeChannels.has('r')) indices.push(0);
    if (activeChannels.has('g')) indices.push(1);
    if (activeChannels.has('b')) indices.push(2);
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dst = (y * w + x) * 4;

      for (const ci of indices) {
        let sum = 0;
        for (let ky = 0; ky < 3; ky++) {
          const srcRow = (y + ky) * pw;
          const k0 = kernel[ky][0];
          const k1 = kernel[ky][1];
          const k2 = kernel[ky][2];
          sum +=
            k0 * padded[(srcRow + x)     * 4 + ci] +
            k1 * padded[(srcRow + x + 1) * 4 + ci] +
            k2 * padded[(srcRow + x + 2) * 4 + ci];
        }
        out[dst + ci] = Math.max(0, Math.min(255, Math.round(sum)));
      }

      // Replicate processed channel to G and B for grayscale images
      if (grayscale && activeChannels.has('gray')) {
        out[dst + 1] = out[dst];
        out[dst + 2] = out[dst];
      }
    }
  }

  return out;
}
