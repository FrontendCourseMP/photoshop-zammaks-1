import { GB7_SIGNATURE, GB7_VERSION } from './types';
import type { ImageData } from './types';

/**
 * Декодирует формат GB7
 */
export function decodeGB7(buffer: ArrayBuffer): ImageData {
  const view = new DataView(buffer);
  let offset = 0;

  // Проверка сигнатуры
  const signature = [
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++),
    view.getUint8(offset++),
  ];

  if (
    signature[0] !== GB7_SIGNATURE[0] ||
    signature[1] !== GB7_SIGNATURE[1] ||
    signature[2] !== GB7_SIGNATURE[2] ||
    signature[3] !== GB7_SIGNATURE[3]
  ) {
    throw new Error('Неверная сигнатура GB7 файла');
  }

  // Чтение версии
  const version = view.getUint8(offset++);
  if (version !== GB7_VERSION) {
    throw new Error(`Неподдерживаемая версия GB7: ${version}`);
  }

  // Чтение флага
  const flagByte = view.getUint8(offset++);
  const hasAlpha = (flagByte & 0x01) !== 0;

  // Чтение ширины и высоты (big-endian, 16-бит)
  const width = view.getUint16(offset, false); // false = big-endian
  offset += 2;
  const height = view.getUint16(offset, false);
  offset += 2;

  // Пропуск зарезервированных 2 байт
  offset += 2;

  // Вычисление размера изображения
  const expectedSize = width * height;
  if (buffer.byteLength - offset < expectedSize) {
    throw new Error('Размер буфера не соответствует размеру изображения');
  }

  // Чтение данных пикселей
  const pixelData = new Uint8Array(buffer, offset, expectedSize);

  // Создание RGBA данных для canvas (каждый пиксель становится 4 байтами)
  const imageData = new Uint8Array(width * height * 4);

  for (let i = 0; i < expectedSize; i++) {
    const byte = pixelData[i];
    
    // Извлечение 7-битного значения серого (биты 0-6)
    const grayscale = byte & 0x7f;
    
    // Извлечение бита маски (бит 7)
    const maskBit = (byte & 0x80) >> 7;

    // Заполнение RGBA (для серого RGB одинаковые)
    const baseIndex = i * 4;
    imageData[baseIndex] = grayscale; // R
    imageData[baseIndex + 1] = grayscale; // G
    imageData[baseIndex + 2] = grayscale; // B

    // Альфа-канал: если есть маска и бит = 0, то прозрачный (0), иначе непрозрачный (255)
    if (hasAlpha) {
      imageData[baseIndex + 3] = maskBit ? 255 : 0;
    } else {
      imageData[baseIndex + 3] = 255;
    }
  }

  return {
    width,
    height,
    depth: hasAlpha ? 8 : 7, // 7 бит для серого + опциональный бит маски
    data: imageData,
    hasAlpha,
  };
}

/**
 * Кодирует изображение в формат GB7
 */
export function encodeGB7(imageData: ImageData): ArrayBuffer {
  const { width, height, data, hasAlpha } = imageData;

  // Размер буфера: 4 байта сигнатура + 8 байт мета + width*height байт данных
  const headerSize = 12;
  const pixelDataSize = width * height;
  const totalSize = headerSize + pixelDataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const pixels = new Uint8Array(buffer, headerSize);

  let offset = 0;

  // Запись сигнатуры
  GB7_SIGNATURE.forEach((byte) => {
    view.setUint8(offset++, byte);
  });

  // Запись версии
  view.setUint8(offset++, GB7_VERSION);

  // Запись флага
  const flagByte = hasAlpha ? 0x01 : 0x00;
  view.setUint8(offset++, flagByte);

  // Запись ширины и высоты (big-endian)
  view.setUint16(offset, width, false); // false = big-endian
  offset += 2;
  view.setUint16(offset, height, false);
  offset += 2;

  // Запись зарезервированных байт
  view.setUint16(offset, 0x0000, false);

  // Конверсия RGBA в GB7: берем R компоненту (для серого G и B такие же)
  // и если есть маска, используем альфа-канал
  for (let i = 0; i < width * height; i++) {
    const baseIndex = i * 4;
    const r = data[baseIndex];
    const alpha = data[baseIndex + 3];

    let byte = r & 0x7f; // Маска для 7 бит

    if (hasAlpha) {
      // Бит 7: если альфа > 127, то пиксель видим (бит = 1)
      if (alpha > 127) {
        byte |= 0x80;
      }
    }

    pixels[i] = byte;
  }

  return buffer;
}
