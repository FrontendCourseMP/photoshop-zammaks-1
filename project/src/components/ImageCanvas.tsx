import { useEffect, useRef, useCallback } from 'react';
import type { ImageData } from '../types';
import type { ChannelKey } from '../channelUtils';
import type { InterpolationMethod } from '../interpolation';
import { applyChannelMask, isGrayscaleImage } from '../channelUtils';
import { renderScaledToCanvas } from '../interpolation';
import '../styles/ImageCanvas.css';

const ZOOM_STEP = 1.15;
const SCALE_MIN = 0.12;
const SCALE_MAX = 3.0;

interface ImageCanvasProps {
  imageData: ImageData;
  activeChannels: Set<ChannelKey>;
  activeTool: 'eyedropper' | null;
  onPixelPick: (x: number, y: number, r: number, g: number, b: number) => void;
  sourceOverride?: Uint8Array;
  displayScale: number;
  interpolation: InterpolationMethod;
  onScaleChange: (scale: number) => void;
}

const ImageCanvas = ({
  imageData,
  activeChannels,
  activeTool,
  onPixelPick,
  sourceOverride,
  displayScale,
  interpolation,
  onScaleChange,
}: ImageCanvasProps) => {
  const containerRef    = useRef<HTMLDivElement>(null);
  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const panOffsetRef    = useRef({ x: 0, y: 0 });
  const isDraggingRef   = useRef(false);
  const dragStartRef    = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
  const internalScaleRef = useRef(displayScale);
  const rafRef          = useRef<number | null>(null);

  // Latest props accessible inside stable callbacks without stale closures
  const propsRef = useRef({ imageData, activeChannels, sourceOverride, interpolation, activeTool, onPixelPick, onScaleChange });
  propsRef.current = { imageData, activeChannels, sourceOverride, interpolation, activeTool, onPixelPick, onScaleChange };

  const redraw = useCallback(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width  = cw;
      canvas.height = ch;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, cw, ch);

    const { imageData, activeChannels, sourceOverride, interpolation } = propsRef.current;
    const scale  = internalScaleRef.current;
    const { x: panX, y: panY } = panOffsetRef.current;
    const source = sourceOverride ?? imageData.data;
    const masked = applyChannelMask(source, activeChannels, isGrayscaleImage(imageData));

    const { pixels, drawX, drawY, drawW, drawH } = renderScaledToCanvas(
      masked, imageData.width, imageData.height, scale, cw, ch, interpolation, panX, panY,
    );

    if (drawW > 0 && drawH > 0) {
      const imgData = ctx.createImageData(drawW, drawH);
      imgData.data.set(pixels);
      ctx.putImageData(imgData, drawX, drawY);
    }
  }, []);

  const scheduleRedraw = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      redraw();
      rafRef.current = null;
    });
  }, [redraw]);

  // Sync internal scale when prop changes from outside (slider / select)
  useEffect(() => {
    internalScaleRef.current = displayScale;
    scheduleRedraw();
  }, [displayScale, scheduleRedraw]);

  // Redraw when other rendering inputs change
  useEffect(() => {
    scheduleRedraw();
  }, [imageData, activeChannels, sourceOverride, interpolation, scheduleRedraw]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(scheduleRedraw);
    obs.observe(container);
    return () => obs.disconnect();
  }, [scheduleRedraw]);

  // Reset pan when image dimensions change
  const prevDimsRef = useRef({ w: imageData.width, h: imageData.height });
  useEffect(() => {
    const prev = prevDimsRef.current;
    if (prev.w !== imageData.width || prev.h !== imageData.height) {
      prevDimsRef.current = { w: imageData.width, h: imageData.height };
      panOffsetRef.current = { x: 0, y: 0 };
    }
  }, [imageData.width, imageData.height]);

  // Wheel zoom — keeps the point under the cursor fixed
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect       = canvas.getBoundingClientRect();
      const cssToPixX  = canvas.width  / rect.width;
      const cssToPixY  = canvas.height / rect.height;
      const cursorCX   = (e.clientX - rect.left) * cssToPixX;
      const cursorCY   = (e.clientY - rect.top)  * cssToPixY;

      const oldScale = internalScaleRef.current;
      const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX,
        e.deltaY < 0 ? oldScale * ZOOM_STEP : oldScale / ZOOM_STEP,
      ));
      if (newScale === oldScale) return;

      const cw = canvas.width;
      const ch = canvas.height;
      const { x: panX, y: panY } = panOffsetRef.current;
      const { imageData } = propsRef.current;

      // Current image-space coords under cursor
      const oldScaledW = imageData.width  * oldScale;
      const oldScaledH = imageData.height * oldScale;
      const oldOx = (cw - oldScaledW) / 2 + panX;
      const oldOy = (ch - oldScaledH) / 2 + panY;
      const imgX = (cursorCX - oldOx) / oldScale;
      const imgY = (cursorCY - oldOy) / oldScale;

      // New pan so that same image point stays under cursor
      const newScaledW = imageData.width  * newScale;
      const newScaledH = imageData.height * newScale;
      const newPanX = (cursorCX - imgX * newScale) - (cw - newScaledW) / 2;
      const newPanY = (cursorCY - imgY * newScale) - (ch - newScaledH) / 2;

      internalScaleRef.current = newScale;
      panOffsetRef.current = { x: newPanX, y: newPanY };
      propsRef.current.onScaleChange(newScale);
      scheduleRedraw();
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [scheduleRedraw]);

  // Global mouse handlers for pan drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      panOffsetRef.current = {
        x: dragStartRef.current.panX + (e.clientX - dragStartRef.current.mouseX),
        y: dragStartRef.current.panY + (e.clientY - dragStartRef.current.mouseY),
      };
      scheduleRedraw();
    };
    const onMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [scheduleRedraw]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (propsRef.current.activeTool === 'eyedropper') return;
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: panOffsetRef.current.x,
      panY: panOffsetRef.current.y,
    };
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = 'grabbing';
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (propsRef.current.activeTool !== 'eyedropper') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect      = canvas.getBoundingClientRect();
    const cssToPixX = canvas.width  / rect.width;
    const cssToPixY = canvas.height / rect.height;
    const canvasX   = (e.clientX - rect.left) * cssToPixX;
    const canvasY   = (e.clientY - rect.top)  * cssToPixY;

    const { imageData, sourceOverride, onPixelPick } = propsRef.current;
    const scale   = internalScaleRef.current;
    const { x: panX, y: panY } = panOffsetRef.current;
    const scaledW = Math.round(imageData.width  * scale);
    const scaledH = Math.round(imageData.height * scale);
    const offsetX = Math.round((canvas.width  - scaledW) / 2) + Math.round(panX);
    const offsetY = Math.round((canvas.height - scaledH) / 2) + Math.round(panY);

    const imgX = canvasX - offsetX;
    const imgY = canvasY - offsetY;
    if (imgX < 0 || imgX >= scaledW || imgY < 0 || imgY >= scaledH) return;

    const srcX = Math.min(Math.floor(imgX / scale), imageData.width  - 1);
    const srcY = Math.min(Math.floor(imgY / scale), imageData.height - 1);
    const src  = sourceOverride ?? imageData.data;
    const p    = (srcY * imageData.width + srcX) * 4;
    onPixelPick(srcX, srcY, src[p], src[p + 1], src[p + 2]);
  }, []);

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas
        ref={canvasRef}
        className={`canvas${activeTool === 'eyedropper' ? ' eyedropper-active' : ' pan-active'}`}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
      />
    </div>
  );
};

export default ImageCanvas;
