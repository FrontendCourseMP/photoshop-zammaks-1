import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { ImageData as AppImageData } from '../types';
import {
  type LevelsChannel,
  type ChannelLevels,
  type LevelsSettings,
  defaultChannelLevels,
  defaultSettings,
  applyLevels,
  computeHistogram,
  gammaToFraction,
  fractionToGamma,
} from '../levelsUtils';
import { isGrayscaleImage } from '../channelUtils';
import '../styles/LevelsDialog.css';

const HIST_W  = 256;
const HIST_H  = 88;
const GRAD_H  = 14;
const HANDLE_H = 22;
const CANVAS_H = HIST_H + GRAD_H + HANDLE_H;

const CHANNEL_COLORS: Record<LevelsChannel, string> = {
  master: '#aaaaaa',
  r: '#d04040',
  g: '#3ea83e',
  b: '#3870d0',
  a: '#888888',
  gray: '#aaaaaa',
};

const CHANNEL_LABELS: Record<LevelsChannel, string> = {
  master: 'Композит (RGB)',
  r: 'Красный',
  g: 'Зелёный',
  b: 'Синий',
  a: 'Альфа',
  gray: 'Серый',
};

type SliderTarget = 'black' | 'white' | 'gamma' | null;

// ── Canvas drawing ─────────────────────────────────────────────────────────────

function drawCanvas(
  canvas: HTMLCanvasElement,
  histogram: Uint32Array,
  settings: LevelsSettings,
  logScale: boolean,
  color: string,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, HIST_W, CANVAS_H);

  // Histogram bars
  let maxCount = 1;
  for (let i = 0; i < 256; i++) if (histogram[i] > maxCount) maxCount = histogram[i];
  const displayMax = logScale ? Math.log(maxCount + 1) : maxCount;

  ctx.fillStyle = color + 'bb';
  for (let i = 0; i < 256; i++) {
    const raw = histogram[i];
    const val = logScale ? Math.log(raw + 1) : raw;
    const barH = (val / displayMax) * (HIST_H - 1);
    if (barH >= 0.5) ctx.fillRect(i, HIST_H - barH, 1, barH);
  }

  // Gradient strip
  const grad = ctx.createLinearGradient(0, 0, HIST_W, 0);
  grad.addColorStop(0, '#000');
  grad.addColorStop(1, '#fff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, HIST_H, HIST_W, GRAD_H);

  // Handle area background
  ctx.fillStyle = '#252525';
  ctx.fillRect(0, HIST_H + GRAD_H, HIST_W, HANDLE_H);

  const { inputBlack, inputWhite, gamma } = settings;
  const gammaFrac = gammaToFraction(gamma);
  const gammaX = Math.round(inputBlack + gammaFrac * (inputWhite - inputBlack));
  const HY = HIST_H + GRAD_H;

  drawHandle(ctx, inputBlack, HY, '#111',    '#bbb');
  drawHandle(ctx, inputWhite, HY, '#f0f0f0', '#666');
  drawHandle(ctx, gammaX,    HY, '#909090', '#444');
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  stroke: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x,     y + 1);
  ctx.lineTo(x - 5, y + 17);
  ctx.lineTo(x + 5, y + 17);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  imageData: AppImageData;
  onPreview: (data: Uint8Array | null) => void;
  onApply: (data: Uint8Array) => void;
  onClose: () => void;
}

const LevelsDialog = ({ imageData, onPreview, onApply, onClose }: Props) => {
  const dialogRef  = useRef<HTMLDialogElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);

  // Stable callback refs (avoid stale closures in event listeners)
  const onPreviewRef = useRef(onPreview);
  const onCloseRef   = useRef(onClose);
  useEffect(() => { onPreviewRef.current = onPreview; }, [onPreview]);
  useEffect(() => { onCloseRef.current   = onClose;   }, [onClose]);

  // Mutable refs for drag/slider (avoid re-renders in hot paths)
  const sliderDragRef  = useRef<SliderTarget>(null);
  const channelRef     = useRef<LevelsChannel>('master');
  const settingsRef    = useRef<LevelsSettings>(defaultSettings());
  const rafRef         = useRef<number | null>(null);

  const isGray = isGrayscaleImage(imageData);

  // Dialog state
  const [channel,        setChannel]        = useState<LevelsChannel>(() =>
    imageData.depth <= 8 ? 'gray' : 'master',
  );
  const [levels,         setLevels]         = useState<ChannelLevels>(defaultChannelLevels);
  const [logScale,       setLogScale]       = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const currentSettings = levels[channel];

  useEffect(() => { channelRef.current  = channel;         }, [channel]);
  useEffect(() => { settingsRef.current = currentSettings; }, [currentSettings]);

  // ── Open dialog (non-modal — no backdrop, no screen lock) ──────────────────
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Place on the right so it doesn't overlap the left panel
    const x = Math.max(230, window.innerWidth - 2400);
    dialog.style.left = `${x}px`;
    dialog.style.top  = '80px';

    dialog.show(); // non-modal: no backdrop, background stays interactive
    // No cleanup: React removes the element from DOM on unmount.
    // dialog.close() here would fire 'close' → setShowLevels(false) → StrictMode loop.
  }, []);

  // ── Native close (Escape key or dialog.close()) ────────────────────────────
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const h = () => onCloseRef.current();
    dialog.addEventListener('close', h);
    return () => dialog.removeEventListener('close', h);
  }, []);

  // ── Window drag (titlebar) ──────────────────────────────────────────────────
  const handleTitlebarMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startLeft   = parseInt(dialog.style.left  || '0', 10);
    const startTop    = parseInt(dialog.style.top   || '0', 10);

    const onMove = (ev: MouseEvent) => {
      dialog.style.left = `${startLeft + ev.clientX - startMouseX}px`;
      dialog.style.top  = `${startTop  + ev.clientY - startMouseY}px`;
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, []);

  // ── Histogram ──────────────────────────────────────────────────────────────
  const histogram = useMemo(
    () => computeHistogram(imageData.data, channel),
    [imageData.data, channel],
  );
  // ── Canvas redraw ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;
    drawCanvas(canvasRef.current, histogram, currentSettings, logScale, CHANNEL_COLORS[channel]);
  }, [histogram, currentSettings, logScale, channel]);

  // ── Preview via rAF ────────────────────────────────────────────────────────
  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (previewEnabled) {
        onPreviewRef.current(applyLevels(imageData.data, levels, imageData.hasAlpha, imageData.depth <= 8));
      } else {
        onPreviewRef.current(null);
      }
      rafRef.current = null;
    });
    // Cancel the pending rAF when deps change or component unmounts.
    // Without this, the rAF fires after Apply commits the new imageData and
    // calls applyLevels on already-adjusted data, causing a double application.
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [levels, previewEnabled, imageData]);

  // ── Settings update (uses channelRef so handler stays stable) ──────────────
  const updateSettings = useCallback((patch: Partial<LevelsSettings>) => {
    setLevels(prev => ({
      ...prev,
      [channelRef.current]: { ...prev[channelRef.current], ...patch },
    }));
  }, []);

  // ── Slider canvas interaction ───────────────────────────────────────────────
  const clientXToCanvasValue = useCallback((clientX: number): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) * (HIST_W / rect.width);
  }, []);

  const applySliderDrag = useCallback((clientX: number) => {
    const target = sliderDragRef.current;
    if (!target) return;

    const rawX = Math.max(0, Math.min(255, clientXToCanvasValue(clientX)));
    const { inputBlack, inputWhite } = settingsRef.current;

    if (target === 'black') {
      updateSettings({ inputBlack: Math.min(Math.round(rawX), inputWhite - 1) });
    } else if (target === 'white') {
      updateSettings({ inputWhite: Math.max(Math.round(rawX), inputBlack + 1) });
    } else {
      const range = inputWhite - inputBlack;
      if (range > 0) {
        updateSettings({ gamma: fractionToGamma((rawX - inputBlack) / range) });
      }
    }
  }, [clientXToCanvasValue, updateSettings]);

  // Global handlers for slider drag (works even when mouse leaves canvas)
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (sliderDragRef.current) applySliderDrag(e.clientX); };
    const onUp   = () => { sliderDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [applySliderDrag]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const x = clientXToCanvasValue(e.clientX);
    const { inputBlack, inputWhite, gamma } = settingsRef.current;
    const gammaFrac = gammaToFraction(gamma);
    const gammaX = inputBlack + gammaFrac * (inputWhite - inputBlack);
    const HIT = 8;

    if      (Math.abs(x - gammaX)    < HIT) sliderDragRef.current = 'gamma';
    else if (Math.abs(x - inputBlack) < HIT) sliderDragRef.current = 'black';
    else if (Math.abs(x - inputWhite) < HIT) sliderDragRef.current = 'white';
  }, [clientXToCanvasValue]);

  // ── Button handlers ────────────────────────────────────────────────────────
  const handleReset = () =>
    setLevels(prev => ({ ...prev, [channel]: defaultSettings() }));

  const handleCancel = () => {
    onPreviewRef.current(null);
    dialogRef.current?.close(); // fires 'close' → listener calls onClose
  };

  const handleApply = () => {
    // Cancel pending preview rAF before committing — prevents it from firing
    // with the new imageData after onApply updates state.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const adjusted = applyLevels(imageData.data, levels, imageData.hasAlpha, imageData.depth <= 8);
    onPreviewRef.current(null);
    onApply(adjusted);
    dialogRef.current?.close(); // fires 'close' → listener calls onClose
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const { inputBlack, inputWhite, gamma } = currentSettings;

  const channelOptions: Array<{ key: LevelsChannel; label: string }> = isGray
    ? [
        { key: 'gray', label: CHANNEL_LABELS.gray },
        ...(imageData.hasAlpha ? [{ key: 'a' as LevelsChannel, label: CHANNEL_LABELS.a }] : []),
      ]
    : [
        { key: 'master', label: CHANNEL_LABELS.master },
        { key: 'r',      label: CHANNEL_LABELS.r },
        { key: 'g',      label: CHANNEL_LABELS.g },
        { key: 'b',      label: CHANNEL_LABELS.b },
        ...(imageData.hasAlpha ? [{ key: 'a' as LevelsChannel, label: CHANNEL_LABELS.a }] : []),
      ];

  return (
    <dialog ref={dialogRef} className="levels-dialog">
      {/* Draggable titlebar */}
      <div className="levels-titlebar" onMouseDown={handleTitlebarMouseDown}>
        <span>Уровни</span>
        <button className="levels-close-btn" onClick={handleCancel} title="Закрыть">✕</button>
      </div>

      <div className="levels-body">
        {/* Channel selector + log scale */}
        <div className="levels-toolbar">
          <label className="levels-label">Канал</label>
          <select
            className="levels-select"
            value={channel}
            onChange={e => setChannel(e.target.value as LevelsChannel)}
          >
            {channelOptions.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <label className="levels-check-label">
            <input
              type="checkbox"
              checked={logScale}
              onChange={e => setLogScale(e.target.checked)}
            />
            Лог
          </label>
        </div>

        {/* Histogram + gradient strip + handles */}
        <div className="levels-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="levels-canvas"
            width={HIST_W}
            height={CANVAS_H}
            onMouseDown={handleCanvasMouseDown}
          />
        </div>

        {/* Numeric inputs */}
        <div className="levels-inputs">
          <div className="levels-input-col">
            <label>Тёмные</label>
            <input
              className="levels-num"
              type="number"
              min={0}
              max={inputWhite - 1}
              value={inputBlack}
              onChange={e => {
                const v = Math.max(0, Math.min(inputWhite - 1, Math.round(+e.target.value)));
                if (!Number.isNaN(v)) updateSettings({ inputBlack: v });
              }}
            />
          </div>
          <div className="levels-input-col">
            <label>Гамма</label>
            <input
              className="levels-num"
              type="number"
              min={0.10}
              max={9.90}
              step={0.01}
              value={gamma.toFixed(2)}
              onChange={e => {
                const v = Math.max(0.1, Math.min(9.9, +e.target.value));
                if (!Number.isNaN(v)) updateSettings({ gamma: v });
              }}
            />
          </div>
          <div className="levels-input-col">
            <label>Светлые</label>
            <input
              className="levels-num"
              type="number"
              min={inputBlack + 1}
              max={255}
              value={inputWhite}
              onChange={e => {
                const v = Math.max(inputBlack + 1, Math.min(255, Math.round(+e.target.value)));
                if (!Number.isNaN(v)) updateSettings({ inputWhite: v });
              }}
            />
          </div>
        </div>

        {/* Preview toggle */}
        <div className="levels-preview-row">
          <label className="levels-check-label">
            <input
              type="checkbox"
              checked={previewEnabled}
              onChange={e => setPreviewEnabled(e.target.checked)}
            />
            Предпросмотр
          </label>
        </div>
      </div>

      {/* Footer buttons */}
      <div className="levels-footer">
        <button className="btn" onClick={handleReset}>Сброс</button>
        <div className="levels-footer-actions">
          <button className="btn" onClick={handleCancel}>Отмена</button>
          <button className="btn levels-btn-apply" onClick={handleApply}>Применить</button>
        </div>
      </div>
    </dialog>
  );
};

export default LevelsDialog;
