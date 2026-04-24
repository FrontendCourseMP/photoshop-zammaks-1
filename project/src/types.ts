export interface ImageData {
  width: number;
  height: number;
  depth: number; // глубина цвета в битах
  data: Uint8Array;
  hasAlpha: boolean; // для PNG с альфа-каналом или GB7 с маской
}

export interface GB7Header {
  version: number;
  hasAlpha: boolean;
  width: number;
  height: number;
}

export const GB7_SIGNATURE = [0x47, 0x42, 0x37, 0x1d]; // "GB7" + control char
export const GB7_VERSION = 0x01;
