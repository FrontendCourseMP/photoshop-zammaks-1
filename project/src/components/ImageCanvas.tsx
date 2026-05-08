import { useEffect, useRef } from 'react';
import type { ImageData } from '../types';
import '../styles/ImageCanvas.css';

interface ImageCanvasProps {
  imageData: ImageData;
}

const ImageCanvas = ({ imageData }: ImageCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = imageData.width;
    canvas.height = imageData.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasImageData = ctx.createImageData(imageData.width, imageData.height);
    canvasImageData.data.set(imageData.data);
    ctx.putImageData(canvasImageData, 0, 0);
  }, [imageData]);

  return (
    <div className="canvas-container">
      <canvas ref={canvasRef} className="canvas" />
    </div>
  );
};

export default ImageCanvas;
