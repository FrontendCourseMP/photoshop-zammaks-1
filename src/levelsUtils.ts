export type LevelsChannel = 'master' | 'r' | 'g' | 'b' | 'a' | 'gray';

export interface LevelsSettings {
  inputBlack: number; // 0-255
  inputWhite: number; // 0-255
  gamma: number;      // 0.1-9.9, 1.0 = neutral
}

export interface ChannelLevels {
  master: LevelsSettings;
  r: LevelsSettings;
  g: LevelsSettings;
  b: LevelsSettings;
  a: LevelsSettings;
  gray: LevelsSettings;
}

export function defaultSettings(): LevelsSettings {
  return { inputBlack: 0, inputWhite: 255, gamma: 1.0 };
}

export function defaultChannelLevels(): ChannelLevels {
  return {
    master: defaultSettings(),
    r: defaultSettings(),
    g: defaultSettings(),
    b: defaultSettings(),
    a: defaultSettings(),
    gray: defaultSettings(),
  };
}

// Build a 256-entry LUT for the given settings
export function buildLUT(s: LevelsSettings): Uint8Array {
  const lut = new Uint8Array(256);
  const { inputBlack, inputWhite, gamma } = s;
  const range = inputWhite - inputBlack;

  for (let i = 0; i < 256; i++) {
    if (range <= 0) {
      lut[i] = i <= inputBlack ? 0 : 255;
      continue;
    }
    const clamped = Math.max(inputBlack, Math.min(inputWhite, i));
    let norm = (clamped - inputBlack) / range;
    if (gamma !== 1.0 && norm > 0) {
      norm = Math.pow(norm, 1.0 / gamma);
    }
    lut[i] = Math.max(0, Math.min(255, Math.round(norm * 255)));
  }

  return lut;
}

// Apply channel levels to raw RGBA data via LUT composition (master → per-channel)
export function applyLevels(
  src: Uint8Array,
  levels: ChannelLevels,
  hasAlpha: boolean,
  grayscale = false,
): Uint8Array {
  const out = new Uint8Array(src.length);
  const n = src.length >>> 2;
  const aLUT = buildLUT(levels.a);

  if (grayscale) {
    const grayLUT = buildLUT(levels.gray);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const v = grayLUT[src[p]];
      out[p] = v; out[p + 1] = v; out[p + 2] = v;
      out[p + 3] = hasAlpha ? aLUT[src[p + 3]] : src[p + 3];
    }
  } else {
    const mLUT = buildLUT(levels.master);
    const rLUT = buildLUT(levels.r);
    const gLUT = buildLUT(levels.g);
    const bLUT = buildLUT(levels.b);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      out[p]     = rLUT[mLUT[src[p]]];
      out[p + 1] = gLUT[mLUT[src[p + 1]]];
      out[p + 2] = bLUT[mLUT[src[p + 2]]];
      out[p + 3] = hasAlpha ? aLUT[src[p + 3]] : src[p + 3];
    }
  }

  return out;
}

// Compute 256-bucket histogram for the selected channel.
// For 'master', uses luminance (Rec. 709) of RGB.
export function computeHistogram(
  data: Uint8Array,
  channel: LevelsChannel,
): Uint32Array {
  const hist = new Uint32Array(256);
  const n = data.length >>> 2;

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    let v: number;
    switch (channel) {
      case 'master':
        v = Math.min(255, Math.round(0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]));
        break;
      case 'r': v = data[p]; break;
      case 'g': v = data[p + 1]; break;
      case 'b': v = data[p + 2]; break;
      case 'gray': v = data[p]; break; // R=G=B for grayscale images
      default:  v = data[p + 3]; break;
    }
    hist[v]++;
  }

  return hist;
}

// Map gamma (0.1-9.9) to a 0-1 fraction for the visual slider position.
// gamma=1 → 0.5 (center), gamma=9.9 → ~0, gamma=0.1 → ~1
export function gammaToFraction(gamma: number): number {
  return (1 - Math.log10(Math.max(0.1, Math.min(9.9, gamma)))) / 2;
}

// Inverse of gammaToFraction
export function fractionToGamma(f: number): number {
  const clamped = Math.max(0.005, Math.min(0.995, f));
  return Math.max(0.1, Math.min(9.9, Math.pow(10, 1 - 2 * clamped)));
}
