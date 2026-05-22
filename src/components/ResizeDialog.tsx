import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import type { ImageData as AppImageData } from '../types';
import {
  type InterpolationMethod,
  INTERPOLATION_METHODS,
  scaleImage,
} from '../interpolation';
import '../styles/ResizeDialog.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type Unit = 'px' | 'pct';

interface FormState {
  unit: Unit;
  width: string;
  height: string;
  linked: boolean;
  method: InterpolationMethod;
}

interface Errors {
  width?: string;
  height?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PX_MIN = 1;
const PX_MAX = 10_000;
const PCT_MIN = 1;
const PCT_MAX = 1_000;

function clampStr(s: string, lo: number, hi: number): string {
  const n = parseFloat(s);
  if (Number.isNaN(n)) return s;
  return String(Math.max(lo, Math.min(hi, n)));
}

function validate(state: FormState): Errors {
  const errs: Errors = {};
  const w = parseFloat(state.width);
  const h = parseFloat(state.height);

  if (state.unit === 'px') {
    if (!Number.isInteger(w) || w < PX_MIN || w > PX_MAX)
      errs.width = `Целое число от ${PX_MIN} до ${PX_MAX}`;
    if (!Number.isInteger(h) || h < PX_MIN || h > PX_MAX)
      errs.height = `Целое число от ${PX_MIN} до ${PX_MAX}`;
  } else {
    if (Number.isNaN(w) || w < PCT_MIN || w > PCT_MAX)
      errs.width = `Число от ${PCT_MIN} до ${PCT_MAX} %`;
    if (Number.isNaN(h) || h < PCT_MIN || h > PCT_MAX)
      errs.height = `Число от ${PCT_MIN} до ${PCT_MAX} %`;
  }
  return errs;
}

function toTargetPx(state: FormState, srcW: number, srcH: number): { w: number; h: number } | null {
  const wv = parseFloat(state.width);
  const hv = parseFloat(state.height);
  if (Number.isNaN(wv) || Number.isNaN(hv)) return null;

  if (state.unit === 'px') return { w: Math.round(wv), h: Math.round(hv) };
  return {
    w: Math.max(1, Math.round((wv / 100) * srcW)),
    h: Math.max(1, Math.round((hv / 100) * srcH)),
  };
}

function fmtMp(px: number): string {
  return (px / 1_000_000).toFixed(2) + ' Мп';
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  imageData: AppImageData;
  onApply: (newData: Uint8Array, newW: number, newH: number) => void;
  onClose: () => void;
}

const ResizeDialog = ({ imageData, onApply, onClose }: Props) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const srcW = imageData.width;
  const srcH = imageData.height;
  const aspect = srcW / srcH;

  const [state, setState] = useState<FormState>({
    unit: 'px',
    width: String(srcW),
    height: String(srcH),
    linked: true,
    method: 'bilinear',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [applying, setApplying] = useState(false);

  // ── Open dialog (non-modal — no backdrop) ─────────────────────────────────
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const x = Math.max(230, window.innerWidth - 2400);
    dialog.style.left = `${x}px`;
    dialog.style.top  = '480px';

    dialog.show();
    // No cleanup: React removes the <dialog> element from DOM on unmount.
    // Calling dialog.close() here would fire the 'close' event which calls
    // setShowResize(false), causing an infinite loop in React StrictMode.
  }, []);

  // ── Titlebar drag ──────────────────────────────────────────────────────────
  const handleTitlebarMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startLeft   = parseInt(dialog.style.left || '0', 10);
    const startTop    = parseInt(dialog.style.top  || '0', 10);

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

  // Native close (Escape key)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const h = () => onCloseRef.current();
    dialog.addEventListener('close', h);
    return () => dialog.removeEventListener('close', h);
  }, []);

  // Live pixel count preview
  const targetDims = useMemo(() => toTargetPx(state, srcW, srcH), [state, srcW, srcH]);
  const afterMp    = targetDims ? fmtMp(targetDims.w * targetDims.h) : '—';
  const beforeMp   = fmtMp(srcW * srcH);

  const activeMethod = INTERPOLATION_METHODS.find(m => m.key === state.method);

  // ── Unit change ────────────────────────────────────────────────────────────
  const handleUnitChange = (unit: Unit) => {
    setState(prev => {
      const w = parseFloat(prev.width);
      const h = parseFloat(prev.height);
      if (unit === 'pct') {
        const wp = Number.isNaN(w) ? 100 : Math.round((w / srcW) * 100);
        const hp = Number.isNaN(h) ? 100 : Math.round((h / srcH) * 100);
        return { ...prev, unit, width: String(wp), height: String(hp) };
      } else {
        const wpx = Number.isNaN(w) ? srcW : Math.round((w / 100) * srcW);
        const hpx = Number.isNaN(h) ? srcH : Math.round((h / 100) * srcH);
        return { ...prev, unit, width: String(wpx), height: String(hpx) };
      }
    });
    setErrors({});
  };

  // ── Width change ───────────────────────────────────────────────────────────
  const handleWidthChange = (raw: string) => {
    setState(prev => {
      if (!prev.linked) return { ...prev, width: raw };
      const w = parseFloat(raw);
      if (Number.isNaN(w) || w <= 0) return { ...prev, width: raw };

      let h: number;
      if (prev.unit === 'px') {
        h = Math.max(1, Math.round(w / aspect));
      } else {
        h = w;
      }
      return { ...prev, width: raw, height: String(h) };
    });
  };

  // ── Height change ──────────────────────────────────────────────────────────
  const handleHeightChange = (raw: string) => {
    setState(prev => {
      if (!prev.linked) return { ...prev, height: raw };
      const h = parseFloat(raw);
      if (Number.isNaN(h) || h <= 0) return { ...prev, height: raw };

      let w: number;
      if (prev.unit === 'px') {
        w = Math.max(1, Math.round(h * aspect));
      } else {
        w = h;
      }
      return { ...prev, height: raw, width: String(w) };
    });
  };

  // ── Apply ──────────────────────────────────────────────────────────────────
  const handleApply = () => {
    const errs = validate(state);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const dims = toTargetPx(state, srcW, srcH);
    if (!dims) return;

    setApplying(true);
    requestAnimationFrame(() => {
      const result = scaleImage(imageData.data, srcW, srcH, dims.w, dims.h, state.method);
      onApply(result, dims.w, dims.h); // calls setShowResize(false) → component unmounts
    });
  };

  const handleCancel = () => {
    dialogRef.current?.close(); // fires 'close' → listener calls onClose
  };

  return (
    <dialog ref={dialogRef} className="rd-dialog">
      <div className="rd-titlebar" onMouseDown={handleTitlebarMouseDown}>
        <span>Изменение размера</span>
        <button className="rd-close-btn" onClick={handleCancel} title="Закрыть">✕</button>
      </div>

      <div className="rd-body">
        {/* Pixel count */}
        <div className="rd-info-row">
          <span className="rd-info-item">
            <span className="rd-info-label">До</span>
            <span className="rd-info-val">{beforeMp}</span>
          </span>
          <span className="rd-arrow">→</span>
          <span className="rd-info-item">
            <span className="rd-info-label">После</span>
            <span className="rd-info-val">{afterMp}</span>
          </span>
        </div>

        {/* Unit selector */}
        <div className="rd-row">
          <label className="rd-label">Единицы</label>
          <select
            className="rd-select"
            value={state.unit}
            onChange={e => handleUnitChange(e.target.value as Unit)}
          >
            <option value="px">Пиксели</option>
            <option value="pct">Проценты</option>
          </select>
        </div>

        {/* Dimensions */}
        <div className="rd-dims">
          <div className="rd-dim-row">
            <label className="rd-label">Ширина</label>
            <div className="rd-dim-input-wrap">
              <input
                className={`rd-num${errors.width ? ' rd-err' : ''}`}
                type="number"
                min={state.unit === 'px' ? PX_MIN : PCT_MIN}
                max={state.unit === 'px' ? PX_MAX : PCT_MAX}
                step={state.unit === 'px' ? 1 : 0.1}
                value={state.width}
                onChange={e => handleWidthChange(e.target.value)}
                onBlur={e => handleWidthChange(clampStr(e.target.value,
                  state.unit === 'px' ? PX_MIN : PCT_MIN,
                  state.unit === 'px' ? PX_MAX : PCT_MAX,
                ))}
              />
              <span className="rd-unit">{state.unit === 'px' ? 'px' : '%'}</span>
            </div>
            {errors.width && <span className="rd-error-msg">{errors.width}</span>}
          </div>

          {/* Link icon */}
          <div className="rd-link-row">
            <span className="rd-link-line" />
            <button
              className={`rd-link-btn${state.linked ? ' active' : ''}`}
              onClick={() => setState(p => ({ ...p, linked: !p.linked }))}
              title={state.linked ? 'Отвязать пропорции' : 'Привязать пропорции'}
            >
              {state.linked ? '🔗' : '🔓'}
            </button>
            <span className="rd-link-line" />
          </div>

          <div className="rd-dim-row">
            <label className="rd-label">Высота</label>
            <div className="rd-dim-input-wrap">
              <input
                className={`rd-num${errors.height ? ' rd-err' : ''}`}
                type="number"
                min={state.unit === 'px' ? PX_MIN : PCT_MIN}
                max={state.unit === 'px' ? PX_MAX : PCT_MAX}
                step={state.unit === 'px' ? 1 : 0.1}
                value={state.height}
                onChange={e => handleHeightChange(e.target.value)}
                onBlur={e => handleHeightChange(clampStr(e.target.value,
                  state.unit === 'px' ? PX_MIN : PCT_MIN,
                  state.unit === 'px' ? PX_MAX : PCT_MAX,
                ))}
              />
              <span className="rd-unit">{state.unit === 'px' ? 'px' : '%'}</span>
            </div>
            {errors.height && <span className="rd-error-msg">{errors.height}</span>}
          </div>
        </div>

        {/* Interpolation */}
        <div className="rd-row rd-interp-row">
          <label className="rd-label">Интерполяция</label>
          <select
            className="rd-select"
            value={state.method}
            onChange={e => setState(p => ({ ...p, method: e.target.value as InterpolationMethod }))}
          >
            {INTERPOLATION_METHODS.map(m => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
        {activeMethod && (
          <div className="rd-tooltip-box">
            {activeMethod.tooltip}
          </div>
        )}
      </div>

      <div className="rd-footer">
        {applying && <span className="rd-applying">Применяется…</span>}
        <div className="rd-footer-actions">
          <button className="btn" onClick={handleCancel} disabled={applying}>Отмена</button>
          <button className="btn rd-btn-apply" onClick={handleApply} disabled={applying}>
            Применить
          </button>
        </div>
      </div>
    </dialog>
  );
};

export default ResizeDialog;
