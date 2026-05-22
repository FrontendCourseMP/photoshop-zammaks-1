import type { ImageData } from './types';

const GB7_SIGNATURE = [0x47, 0x42, 0x37, 0x1d]; // "GB7" + control char
const GB7_VERSION = 0x01;

export function decodeGB7(buffer: ArrayBuffer): ImageData {
  const view = new DataView(buffer);
  let offset = 0;

  for (let i = 0; i < 4; i++) {
    if (view.getUint8(offset++) !== GB7_SIGNATURE[i]) {
      throw new Error('Неверная сигнатура GB7 файла');
    }
  }

  const version = view.getUint8(offset++);
  if (version !== GB7_VERSION) {
    throw new Error(`Неподдерживаемая версия GB7: ${version}`);
  }

  const flagByte = view.getUint8(offset++);
  const hasAlpha = (flagByte & 0x01) !== 0;

  const width = view.getUint16(offset, false);
  offset += 2;
  const height = view.getUint16(offset, false);
  offset += 2;
  offset += 2; // reserved

  const pixelCount = width * height;
  if (buffer.byteLength - offset < pixelCount) {
    throw new Error('Размер буфера не соответствует размеру изображения');
  }

  const pixelData = new Uint8Array(buffer, offset, pixelCount);
  const imageData = new Uint8Array(pixelCount * 4);

  for (let i = 0; i < pixelCount; i++) {
    const byte = pixelData[i];
    const gray7 = byte & 0x7f;
    const maskBit = (byte & 0x80) >> 7;

    // Scale from 7-bit (0–127) to 8-bit (0–255)
    const gray8 = Math.round(gray7 * 255 / 127);

    const base = i * 4;
    imageData[base]     = gray8;
    imageData[base + 1] = gray8;
    imageData[base + 2] = gray8;
    imageData[base + 3] = hasAlpha ? (maskBit ? 255 : 0) : 255;
  }

  return { width, height, depth: hasAlpha ? 8 : 7, data: imageData, hasAlpha };
}

export function encodeGB7(imageData: ImageData): ArrayBuffer {
  const { width, height, data, hasAlpha } = imageData;

  const headerSize = 12;
  const pixelCount = width * height;
  const buffer = new ArrayBuffer(headerSize + pixelCount);
  const view = new DataView(buffer);
  const pixels = new Uint8Array(buffer, headerSize);

  let offset = 0;
  GB7_SIGNATURE.forEach(b => view.setUint8(offset++, b));
  view.setUint8(offset++, GB7_VERSION);
  view.setUint8(offset++, hasAlpha ? 0x01 : 0x00);
  view.setUint16(offset, width, false); offset += 2;
  view.setUint16(offset, height, false); offset += 2;
  view.setUint16(offset, 0x0000, false);

  for (let i = 0; i < pixelCount; i++) {
    const base = i * 4;
    const r = data[base];
    const g = data[base + 1];
    const b = data[base + 2];
    const alpha = data[base + 3];

    // Luminance-weighted grayscale, scaled from 8-bit (0–255) to 7-bit (0–127)
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const gray7 = Math.round(gray * 127 / 255);

    let byte = gray7 & 0x7f;
    if (hasAlpha && alpha > 127) byte |= 0x80;

    pixels[i] = byte;
  }

  return buffer;
}
