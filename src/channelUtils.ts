import type { ImageData } from './types';

export type ChannelKey = 'gray' | 'r' | 'g' | 'b' | 'a';

export interface Channel {
  key: ChannelKey;
  label: string;
}

export function isGrayscaleImage(imageData: ImageData): boolean {
  return imageData.depth <= 8;
}

export function getChannels(imageData: ImageData): Channel[] {
  const gray = isGrayscaleImage(imageData);

  if (gray && !imageData.hasAlpha) return [{ key: 'gray', label: 'Серый' }];
  if (gray && imageData.hasAlpha)  return [
    { key: 'gray', label: 'Серый' },
    { key: 'a',    label: 'Альфа' },
  ];
  if (!imageData.hasAlpha) return [
    { key: 'r', label: 'R' },
    { key: 'g', label: 'G' },
    { key: 'b', label: 'B' },
  ];
  return [
    { key: 'r', label: 'R' },
    { key: 'g', label: 'G' },
    { key: 'b', label: 'B' },
    { key: 'a', label: 'Альфа' },
  ];
}

/**
 * Применяет маску активных каналов к исходным пиксельным данным RGBA.
 * Исходный массив не изменяется — возвращается новый Uint8Array.
 *
 * Особый случай: если активен только канал «Альфа» (без цветовых каналов),
 * отображается маска прозрачности в градациях серого.
 */
export function applyChannelMask(
  data: Uint8Array,
  active: Set<ChannelKey>,
  grayscale: boolean,
): Uint8Array {
  const out = new Uint8Array(data.length);
  const n = data.length >>> 2;

  const hasGray = active.has('gray');
  const hasR    = active.has('r');
  const hasG    = active.has('g');
  const hasB    = active.has('b');
  const hasA    = active.has('a');

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const oR = data[p], oG = data[p + 1], oB = data[p + 2], oA = data[p + 3];

    if (grayscale) {
      if (hasA && !hasGray) {
        // Только альфа — показываем маску
        out[p] = oA; out[p + 1] = oA; out[p + 2] = oA; out[p + 3] = 255;
      } else {
        const v = hasGray ? oR : 0;
        out[p] = v; out[p + 1] = v; out[p + 2] = v;
        out[p + 3] = hasA ? oA : 255;
      }
    } else {
      if (hasA && !hasR && !hasG && !hasB) {
        // Только альфа — показываем маску
        out[p] = oA; out[p + 1] = oA; out[p + 2] = oA; out[p + 3] = 255;
      } else {
        out[p]     = hasR ? oR : 0;
        out[p + 1] = hasG ? oG : 0;
        out[p + 2] = hasB ? oB : 0;
        out[p + 3] = hasA ? oA : 255;
      }
    }
  }

  return out;
}

/**
 * Рендерит содержимое одного канала в градациях серого для миниатюры.
 * Возвращает Uint8ClampedArray (4 байта/пиксель) размером thumbW × thumbH.
 */
export function renderChannelThumbnail(
  data: Uint8Array,
  srcW: number,
  srcH: number,
  channelKey: ChannelKey,
  thumbW: number,
  thumbH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(thumbW * thumbH * 4);

  for (let ty = 0; ty < thumbH; ty++) {
    for (let tx = 0; tx < thumbW; tx++) {
      const sx = Math.floor(tx * srcW / thumbW);
      const sy = Math.floor(ty * srcH / thumbH);
      const src = (sy * srcW + sx) * 4;

      const dst = (ty * thumbW + tx) * 4;

      // RGB-каналы показываем в цвете; серый и альфа — в градациях серого
      if (channelKey === 'r') {
        out[dst] = data[src]; out[dst + 1] = 0; out[dst + 2] = 0;
      } else if (channelKey === 'g') {
        out[dst] = 0; out[dst + 1] = data[src + 1]; out[dst + 2] = 0;
      } else if (channelKey === 'b') {
        out[dst] = 0; out[dst + 1] = 0; out[dst + 2] = data[src + 2];
      } else {
        // 'gray' или 'a' — grayscale
        const v = channelKey === 'a' ? data[src + 3] : data[src];
        out[dst] = v; out[dst + 1] = v; out[dst + 2] = v;
      }
      out[dst + 3] = 255;
    }
  }

  return out;
}
