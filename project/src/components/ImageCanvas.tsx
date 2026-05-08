import { useEffect, useRef } from 'react';
import type { ImageData } from '../types';
import type { ChannelKey } from '../channelUtils';
import { applyChannelMask, isGrayscaleImage } from '../channelUtils';
import '../styles/ImageCanvas.css';

interface ImageCanvasProps {
  imageData: ImageData;
  activeChannels: Set<ChannelKey>;
  activeTool: 'eyedropper' | null;
  onPixelPick: (x: number, y: number, r: number, g: number, b: number) => void;
}

const ImageCanvas = ({ imageData, activeChannels, activeTool, onPixelPick }: ImageCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width  = imageData.width;
    canvas.height = imageData.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const display = applyChannelMask(imageData.data, activeChannels, isGrayscaleImage(imageData));
    const imgData = ctx.createImageData(imageData.width, imageData.height);
    imgData.data.set(display);
    ctx.putImageData(imgData, 0, 0);
  }, [imageData, activeChannels]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'eyedropper') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    // Коэффициент масштаба между CSS-размером и реальным разрешением холста
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.max(0, Math.min(Math.floor((e.clientX - rect.left) * scaleX), imageData.width  - 1));
    const y = Math.max(0, Math.min(Math.floor((e.clientY - rect.top)  * scaleY), imageData.height - 1));

    // Читаем из холста — там уже применена маска активных каналов
    const px = ctx.getImageData(x, y, 1, 1).data;
    onPixelPick(x, y, px[0], px[1], px[2]);
  };

  return (
    <div className="canvas-container">
      <canvas
        ref={canvasRef}
        className={`canvas${activeTool === 'eyedropper' ? ' eyedropper-active' : ''}`}
        onClick={handleClick}
      />
    </div>
  );
};

export default ImageCanvas;
