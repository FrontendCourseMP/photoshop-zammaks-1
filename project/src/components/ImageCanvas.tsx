import { useEffect, useRef, useState } from 'react';
import type { ImageData } from '../types';
import { exportToPNG, exportToJPG } from '../imageFormats';
import { encodeGB7 } from '../gb7';
import '../styles/ImageCanvas.css';

interface ImageCanvasProps {
  imageData: ImageData;
  fileName: string;
}

const ImageCanvas = ({ imageData, fileName }: ImageCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = imageData.width;
    canvas.height = imageData.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasImageData = ctx.createImageData(
      imageData.width,
      imageData.height
    );
    canvasImageData.data.set(imageData.data);

    ctx.putImageData(canvasImageData, 0, 0);
  }, [imageData]);

  const handleDownload = async (format: 'png' | 'jpg' | 'gb7') => {
    setDownloading(true);
    try {
      let blob: Blob;
      let fileExtension: string;

      if (format === 'png') {
        blob = await exportToPNG(imageData);
        fileExtension = '.png';
      } else if (format === 'jpg') {
        blob = await exportToJPG(imageData);
        fileExtension = '.jpg';
      } else {
        const buffer = encodeGB7(imageData);
        blob = new Blob([buffer], { type: 'application/octet-stream' });
        fileExtension = '.gb7';
      }

      const baseFileName = fileName.split('.')[0] || 'image';
      const downloadFileName = `${baseFileName}${fileExtension}`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Ошибка при скачивании:', error);
      alert('Ошибка при скачивании файла');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="image-canvas">
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          className="canvas"
        />
      </div>

      <div className="controls">
        <h3>Экспорт</h3>
        <div className="button-group">
          <button
            onClick={() => handleDownload('png')}
            disabled={downloading}
            className="btn btn-png"
          >
            PNG
          </button>
          <button
            onClick={() => handleDownload('jpg')}
            disabled={downloading}
            className="btn btn-jpg"
          >
            JPG
          </button>
          <button
            onClick={() => handleDownload('gb7')}
            disabled={downloading}
            className="btn btn-gb7"
          >
            GB7
          </button>
        </div>
        {downloading && <p className="downloading">Скачивание...</p>}
      </div>
    </div>
  );
};

export default ImageCanvas;
