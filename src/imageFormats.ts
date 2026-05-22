import type { ImageData } from './types';

/**
 * Загружает PNG или JPG и возвращает ImageData
 */
export async function loadPNGorJPG(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Создаем canvas и рисуем изображение
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Не удалось получить контекст canvas'));
          return;
        }

        ctx.drawImage(img, 0, 0);

        // Получаем данные пикселей
        const canvasImageData = ctx.getImageData(0, 0, img.width, img.height);
        const data = canvasImageData.data;

        // Определяем глубину цвета
        // Проверяем наличие альфа-канала
        let hasAlpha = false;
        let depth = 24; // RGB по умолчанию

        // Для PNG проверяем наличие не полностью непрозрачных пикселей
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] !== 255) {
            hasAlpha = true;
            depth = 32;
            break;
          }
        }

        resolve({
          width: img.width,
          height: img.height,
          depth,
          data: new Uint8Array(data),
          hasAlpha,
        });
      };

      img.onerror = () => reject(new Error('Ошибка загрузки изображения'));

      // Устанавливаем источник изображения
      if (event.target?.result instanceof ArrayBuffer) {
        const blob = new Blob([event.target.result], { type: file.type });
        img.src = URL.createObjectURL(blob);
      }
    };

    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Экспортирует ImageData в PNG
 */
export async function exportToPNG(imageData: ImageData): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Не удалось получить контекст canvas');
    }

    const canvasImageData = ctx.createImageData(
      imageData.width,
      imageData.height
    );
    canvasImageData.data.set(imageData.data);
    ctx.putImageData(canvasImageData, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        throw new Error('Ошибка при экспорте в PNG');
      }
    }, 'image/png');
  });
}

/**
 * Экспортирует ImageData в JPG
 */
export async function exportToJPG(imageData: ImageData): Promise<Blob> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Не удалось получить контекст canvas');
    }

    const canvasImageData = ctx.createImageData(
      imageData.width,
      imageData.height
    );
    canvasImageData.data.set(imageData.data);
    ctx.putImageData(canvasImageData, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        throw new Error('Ошибка при экспорте в JPG');
      }
    }, 'image/jpeg', 0.9);
  });
}
