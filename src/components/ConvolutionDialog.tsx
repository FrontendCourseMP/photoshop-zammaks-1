import { useRef, useState, useEffect, useCallback } from 'react';
import type { ImageData as AppImageData } from '../types';
import {
  type EdgeHandling,
  type ConvolutionChannel,
  type KernelPreset,
  KERNEL_PRESETS,
} from '../convolutionUtils';
import { isGrayscaleImage } from '../channelUtils';
import '../styles/ConvolutionDialog.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WorkerResult {
  id: number;
  result: Uint8Array;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function kernelToStrings(kernel: number[][]): string[][] {
  return kernel.map(row => row.map(v => {
    // Show clean fractions for common preset values
    const rounded = Math.round(v * 10000) / 10000;
    return String(rounded);
  }));
}

function stringsToKernel(strings: string[][]): number[][] {
  return strings.map(row => row.map(s => {
    const n = parseFloat(s);
    return Number.isNaN(n) ? 0 : n;
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  imageData: AppImageData;
  onPreview: (data: Uint8Array | null) => void;
  onApply: (data: Uint8Array) => void;
  onClose: () => void;
}

const ConvolutionDialog = ({ imageData, onPreview, onApply, onClose }: Props) => {
  const dialogRef    = useRef<HTMLDialogElement>(null);
  const workerRef    = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const onPreviewRef = useRef(onPreview);
  const onCloseRef   = useRef(onClose);

  useEffect(() => { onPreviewRef.current = onPreview; }, [onPreview]);
  useEffect(() => { onCloseRef.current   = onClose;   }, [onClose]);

  const isGray = isGrayscaleImage(imageData);

  // ── State ─────────────────────────────────────────────────────────────────
  const [selectedPreset, setSelectedPreset] = useState<number>(0);
  const [kernelStrings, setKernelStrings]   = useState<string[][]>(
    () => kernelToStrings(KERNEL_PRESETS[0].kernel),
  );
  const [activeChannels, setActiveChannels] = useState<Set<ConvolutionChannel>>(
    () => isGray ? new Set<ConvolutionChannel>(['gray']) : new Set<ConvolutionChannel>(['r', 'g', 'b']),
  );
  const [edge,           setEdge]           = useState<EdgeHandling>('black');
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [processing,     setProcessing]     = useState(false);

  // ── Worker setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const w = new Worker(
      new URL('../workers/convolutionWorker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  // ── Open dialog (non-modal — no backdrop, no screen lock) ────────────────
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Place on the right side so it doesn't overlap left-side dialogs
    dialog.style.left = `${Math.max(10, window.innerWidth - 420)}px`;
    dialog.style.top  = '80px';
    dialog.show();
  }, []);

  // ── Native close (Escape) ─────────────────────────────────────────────────
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const h = () => {
      onPreviewRef.current(null);
      onCloseRef.current();
    };
    dialog.addEventListener('close', h);
    return () => dialog.removeEventListener('close', h);
  }, []);

  // ── Titlebar drag ─────────────────────────────────────────────────────────
  const handleTitlebarMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const rect = dialog.getBoundingClientRect();
    const startLeft = rect.left;
    const startTop  = rect.top;

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

  // ── Run convolution via worker ────────────────────────────────────────────
  const runConvolution = useCallback((
    onResult: (data: Uint8Array) => void,
  ) => {
    const worker = workerRef.current;
    if (!worker) return;

    const id = ++requestIdRef.current;
    const kernel = stringsToKernel(kernelStrings);

    const handler = (ev: MessageEvent<WorkerResult>) => {
      if (ev.data.id !== id) return;
      worker.removeEventListener('message', handler);
      setProcessing(false);
      onResult(ev.data.result);
    };
    worker.addEventListener('message', handler);

    setProcessing(true);
    worker.postMessage({
      id,
      data: new Uint8Array(imageData.data), // copy — do not transfer
      width: imageData.width,
      height: imageData.height,
      kernel,
      activeChannels: [...activeChannels],
      edge,
      grayscale: isGray,
    });
  }, [imageData, kernelStrings, activeChannels, edge, isGray]);

  // ── Preview ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!previewEnabled) {
      onPreviewRef.current(null);
      return;
    }
    runConvolution(result => onPreviewRef.current(result));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kernelStrings, activeChannels, edge, previewEnabled]);

  // ── Preset select ─────────────────────────────────────────────────────────
  const handlePresetChange = (idx: number) => {
    setSelectedPreset(idx);
    if (idx >= 0 && idx < KERNEL_PRESETS.length) {
      setKernelStrings(kernelToStrings(KERNEL_PRESETS[idx].kernel));
    }
  };

  // ── Kernel cell edit ──────────────────────────────────────────────────────
  const handleCellChange = (row: number, col: number, value: string) => {
    setSelectedPreset(-1); // custom — unset preset
    setKernelStrings(prev => {
      const next = prev.map(r => [...r]);
      next[row][col] = value;
      return next;
    });
  };

  // ── Channel toggle ────────────────────────────────────────────────────────
  const handleChannelToggle = (ch: ConvolutionChannel) => {
    setActiveChannels(prev => {
      const next = new Set(prev);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = () => {
    const idx = 0;
    setSelectedPreset(idx);
    setKernelStrings(kernelToStrings(KERNEL_PRESETS[idx].kernel));
    setEdge('black');
    setActiveChannels(
      isGray ? new Set<ConvolutionChannel>(['gray']) : new Set<ConvolutionChannel>(['r', 'g', 'b']),
    );
  };

  // ── Cancel ────────────────────────────────────────────────────────────────
  const handleCancel = () => {
    onPreviewRef.current(null);
    dialogRef.current?.close();
  };

  // ── Apply ─────────────────────────────────────────────────────────────────
  const handleApply = () => {
    runConvolution(result => {
      onPreviewRef.current(null);
      onApply(result);
      dialogRef.current?.close();
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const rgbChannels: Array<{ key: ConvolutionChannel; label: string }> = [
    { key: 'r', label: 'R' },
    { key: 'g', label: 'G' },
    { key: 'b', label: 'B' },
  ];

  const channelList = isGray
    ? [{ key: 'gray' as ConvolutionChannel, label: 'Серый' }]
    : rgbChannels;

  return (
    <dialog ref={dialogRef} className="conv-dialog">
      {/* Titlebar */}
      <div className="conv-titlebar" onMouseDown={handleTitlebarMouseDown}>
        <span>Фильтр (свёртка)</span>
        <button className="conv-close-btn" onClick={handleCancel} title="Закрыть">✕</button>
      </div>

      <div className="conv-body">
        {/* Preset selector */}
        <div>
          <span className="conv-section-label">Предустановка</span>
          <div className="conv-row">
            <select
              className="conv-select"
              value={selectedPreset}
              onChange={e => handlePresetChange(+e.target.value)}
            >
              {selectedPreset === -1 && (
                <option value={-1}>Произвольное</option>
              )}
              {KERNEL_PRESETS.map((p: KernelPreset, i: number) => (
                <option key={i} value={i}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 3×3 kernel grid */}
        <div>
          <span className="conv-section-label">Ядро (3×3)</span>
          <div className="conv-kernel-grid">
            {kernelStrings.map((row, ri) =>
              row.map((val, ci) => (
                <input
                  key={`${ri}-${ci}`}
                  className="conv-kernel-cell"
                  type="number"
                  step="any"
                  value={val}
                  onChange={e => handleCellChange(ri, ci, e.target.value)}
                />
              )),
            )}
          </div>
        </div>

        {/* Channel selection */}
        <div>
          <span className="conv-section-label">Каналы</span>
          <div className="conv-channels">
            {channelList.map(({ key, label }) => (
              <label key={key} className="conv-check-label">
                <input
                  type="checkbox"
                  checked={activeChannels.has(key)}
                  onChange={() => handleChannelToggle(key)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Edge handling */}
        <div>
          <span className="conv-section-label">Обработка краёв</span>
          <div className="conv-edge-group">
            {([ ['black', 'Чёрный'], ['white', 'Белый'], ['copy', 'Копирование'] ] as const).map(
              ([val, label]) => (
                <label key={val} className="conv-radio-label">
                  <input
                    type="radio"
                    name="conv-edge"
                    value={val}
                    checked={edge === val}
                    onChange={() => setEdge(val)}
                  />
                  {label}
                </label>
              ),
            )}
          </div>
        </div>

        {/* Preview toggle */}
        <div className="conv-preview-row">
          <label className="conv-check-label">
            <input
              type="checkbox"
              checked={previewEnabled}
              onChange={e => setPreviewEnabled(e.target.checked)}
            />
            Предпросмотр
          </label>
        </div>
      </div>

      {/* Footer */}
      <div className="conv-footer">
        <button className="btn" onClick={handleReset} disabled={processing}>Сброс</button>
        {processing && <span className="conv-processing">Обработка…</span>}
        <div className="conv-footer-actions">
          <button className="btn" onClick={handleCancel} disabled={processing}>Отмена</button>
          <button
            className="btn conv-btn-apply"
            onClick={handleApply}
            disabled={processing}
          >
            Применить
          </button>
        </div>
      </div>
    </dialog>
  );
};

export default ConvolutionDialog;
