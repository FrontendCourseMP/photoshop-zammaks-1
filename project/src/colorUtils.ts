export interface LabColor {
  L: number;
  a: number;
  b: number;
}

/** Линеаризация sRGB-компоненты (0–255 → линейный свет). */
function linearize(c: number): number {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

/** Вспомогательная функция для перевода XYZ→Lab. */
function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

/**
 * Конвертирует RGB (0–255) в координаты CIE L*a*b* (D65, sRGB).
 * L: 0–100, a и b: ≈ −128…+127.
 */
export function rgbToLab(r: number, g: number, b: number): LabColor {
  const rL = linearize(r);
  const gL = linearize(g);
  const bL = linearize(b);

  // sRGB → XYZ (матрица D65)
  const X = rL * 0.4124564 + gL * 0.3575761 + bL * 0.1804375;
  const Y = rL * 0.2126729 + gL * 0.7151522 + bL * 0.0721750;
  const Z = rL * 0.0193339 + gL * 0.1191920 + bL * 0.9503041;

  // Нормализация по белой точке D65
  const fx = labF(X / 0.95047);
  const fy = labF(Y / 1.00000);
  const fz = labF(Z / 1.08883);

  const round1 = (v: number) => Math.round(v * 10) / 10;

  return {
    L: round1(116 * fy - 16),
    a: round1(500 * (fx - fy)),
    b: round1(200 * (fy - fz)),
  };
}
