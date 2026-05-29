import { useState, useCallback, useEffect, useRef } from 'react';
import ImageCanvas from './components/ImageCanvas';
import ImageUpload from './components/ImageUpload';
import StatusBar from './components/StatusBar';
import ChannelPanel from './components/ChannelPanel';
import LevelsDialog from './components/LevelsDialog';
import ResizeDialog from './components/ResizeDialog';
import ConvolutionDialog from './components/ConvolutionDialog';
import type { ImageData } from './types';
import type { ChannelKey } from './channelUtils';
import { getChannels } from './channelUtils';
import { rgbToLab } from './colorUtils';
import { exportToPNG, exportToJPG } from './imageFormats';
import { encodeGB7 } from './gb7';
import {
  type InterpolationMethod,
  INTERPOLATION_METHODS,
  SCALE_PRESETS,
  calcFitScale,
} from './interpolation';
import './App.css';

interface PickedPixel {
  x: number; y: number;
  r: number; g: number; b: number;
  L: number; labA: number; labB: number;
}

function App() {
  const [imageData,     setImageData]     = useState<ImageData | null>(null);
  const [fileName,      setFileName]      = useState('');
  const [exporting,     setExporting]     = useState(false);
  const [activeChannels,setActiveChannels]= useState<Set<ChannelKey>>(new Set());
  const [activeTool,    setActiveTool]    = useState<'eyedropper' | null>(null);
  const [pickedPixel,   setPickedPixel]   = useState<PickedPixel | null>(null);
  const [showLevels,         setShowLevels]         = useState(false);
  const [levelsPreview,      setLevelsPreview]      = useState<Uint8Array | null>(null);
  const [levelsSnapshotData, setLevelsSnapshotData] = useState<Uint8Array | null>(null);
  const [showResize,         setShowResize]         = useState(false);
  const [showConvolution,    setShowConvolution]    = useState(false);
  const [convPreview,        setConvPreview]        = useState<Uint8Array | null>(null);

  // ── Display scale & interpolation ─────────────────────────────────────────
  const [displayScale,  setDisplayScale]  = useState(1.0);
  const [interpolation, setInterpolation] = useState<InterpolationMethod>('bilinear');
  const mainContentRef = useRef<HTMLElement>(null);

  // Fit scale on new image load
  const prevSizeRef = useRef<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (!imageData) { prevSizeRef.current = null; return; }
    const prev = prevSizeRef.current;
    // Only recalculate on genuinely new image dimensions
    if (prev?.w === imageData.width && prev?.h === imageData.height) return;
    prevSizeRef.current = { w: imageData.width, h: imageData.height };

    const el = mainContentRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setDisplayScale(calcFitScale(imageData.width, imageData.height, width, height));
  }, [imageData]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleImageLoaded = (data: ImageData, name: string) => {
    setActiveChannels(new Set(getChannels(data).map(c => c.key)));
    setPickedPixel(null);
    setImageData(data);
    setFileName(name);
    setLevelsSnapshotData(null);
  };

  const handleReset = () => {
    setImageData(null);
    setFileName('');
    setActiveChannels(new Set());
    setPickedPixel(null);
    setActiveTool(null);
    setShowLevels(false);
    setLevelsPreview(null);
    setLevelsSnapshotData(null);
    setShowResize(false);
    setShowConvolution(false);
    setConvPreview(null);
    setDisplayScale(1.0);
  };

  const handleToggleChannel = (key: ChannelKey) => {
    setActiveChannels(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleToggleEyedropper = () =>
    setActiveTool(t => (t === 'eyedropper' ? null : 'eyedropper'));

  const handlePixelPick = (x: number, y: number, r: number, g: number, b: number) => {
    const lab = rgbToLab(r, g, b);
    setPickedPixel({ x, y, r, g, b, L: lab.L, labA: lab.a, labB: lab.b });
  };

  // Levels
  const handleLevelsPreview = useCallback((data: Uint8Array | null) => setLevelsPreview(data), []);
  const handleLevelsApply   = useCallback((data: Uint8Array) => {
    setImageData(prev => prev ? { ...prev, data } : null);
    setLevelsSnapshotData(null);
  }, []);
  const handleLevelsClose   = useCallback(() => {
    setLevelsPreview(null);
    setShowLevels(false);
  }, []);

  // Resize
  // Convolution
  const handleConvPreview = useCallback((data: Uint8Array | null) => setConvPreview(data), []);
  const handleConvApply   = useCallback((data: Uint8Array) => {
    setImageData(prev => prev ? { ...prev, data } : null);
    setConvPreview(null);
  }, []);
  const handleConvClose   = useCallback(() => {
    setConvPreview(null);
    setShowConvolution(false);
  }, []);

  const handleResizeApply = useCallback((newData: Uint8Array, newW: number, newH: number) => {
    setImageData(prev => {
      if (!prev) return null;
      return { ...prev, data: newData, width: newW, height: newH };
    });
    setPickedPixel(null);
    setLevelsSnapshotData(null);
    setShowResize(false);
  }, []);
  const handleResizeClose = useCallback(() => setShowResize(false), []);

  // Export
  const handleExport = async (format: 'png' | 'jpg' | 'gb7') => {
    if (!imageData) return;
    setExporting(true);
    try {
      let blob: Blob; let ext: string;
      if (format === 'png')      { blob = await exportToPNG(imageData);  ext = '.png'; }
      else if (format === 'jpg') { blob = await exportToJPG(imageData);  ext = '.jpg'; }
      else { blob = new Blob([encodeGB7(imageData)], { type: 'application/octet-stream' }); ext = '.gb7'; }
      const base = fileName.split('.')[0] || 'image';
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `${base}${ext}`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch { alert('Ошибка при экспорте'); }
    finally  { setExporting(false); }
  };

  const channels = imageData ? getChannels(imageData) : [];
  const scalePct = Math.round(displayScale * 100);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Обработчик Изображений</h1>
      </header>

      <div className="app-container">
        <aside className="left-panel">
          <ImageUpload onImageLoaded={handleImageLoaded} onReset={handleReset} />

          {imageData && (
            <>
              {/* Инструменты */}
              <div className="side-section">
                <span className="section-label">Инструменты</span>
                <div className="tool-row">
                  <button
                    className={`btn tool-btn${activeTool === 'eyedropper' ? ' active' : ''}`}
                    onClick={handleToggleEyedropper}
                    title="Считать цвет пикселя"
                  >Пипетка</button>
                  <button
                    className={`btn tool-btn${showLevels ? ' active' : ''}`}
                    onClick={() => {
                      if (imageData && !levelsSnapshotData) setLevelsSnapshotData(imageData.data);
                      setShowLevels(true);
                    }}
                    disabled={showLevels}
                    title="Градационная коррекция"
                  >Уровни</button>
                  <button
                    className={`btn tool-btn${showResize ? ' active' : ''}`}
                    onClick={() => setShowResize(true)}
                    disabled={showResize}
                    title="Изменить размер изображения"
                  >Размер</button>
                  <button
                    className={`btn tool-btn${showConvolution ? ' active' : ''}`}
                    onClick={() => setShowConvolution(true)}
                    disabled={showConvolution}
                    title="Фильтрация (свёртка ядром)"
                  >Фильтры</button>
                </div>
              </div>

              {/* Каналы */}
              <ChannelPanel
                imageData={imageData}
                channels={channels}
                activeChannels={activeChannels}
                onToggleChannel={handleToggleChannel}
              />

              {/* Пиксель */}
              {pickedPixel && (
                <div className="side-section pixel-info">
                  <span className="section-label">Пиксель</span>
                  <div className="px-header">
                    <div
                      className="px-swatch"
                      style={{ background: `rgb(${pickedPixel.r},${pickedPixel.g},${pickedPixel.b})` }}
                    />
                    <div className="px-coords">
                      <span className="px-key">X</span><span className="px-val">{pickedPixel.x}</span>
                      <span className="px-key">Y</span><span className="px-val">{pickedPixel.y}</span>
                    </div>
                  </div>
                  <div className="px-color-row">
                    <span className="px-key">R</span><span className="px-val">{pickedPixel.r}</span>
                    <span className="px-key">G</span><span className="px-val">{pickedPixel.g}</span>
                    <span className="px-key">B</span><span className="px-val">{pickedPixel.b}</span>
                  </div>
                  <div className="px-color-row">
                    <span className="px-key">L*</span><span className="px-val">{pickedPixel.L.toFixed(1)}</span>
                    <span className="px-key">a*</span><span className="px-val">{pickedPixel.labA.toFixed(1)}</span>
                    <span className="px-key">b*</span><span className="px-val">{pickedPixel.labB.toFixed(1)}</span>
                  </div>
                </div>
              )}

              {/* Экспорт */}
              <div className="side-section">
                <span className="section-label">Экспорт</span>
                <div className="export-buttons">
                  <button onClick={() => handleExport('png')} disabled={exporting} className="btn btn-png">PNG</button>
                  <button onClick={() => handleExport('jpg')} disabled={exporting} className="btn btn-jpg">JPG</button>
                  <button onClick={() => handleExport('gb7')} disabled={exporting} className="btn btn-gb7">GB7</button>
                </div>
                {exporting && <span className="export-status">Экспорт…</span>}
              </div>
            </>
          )}
        </aside>

        <main ref={mainContentRef} className="main-content">
          {imageData ? (
            <>
              <ImageCanvas
                imageData={imageData}
                activeChannels={activeChannels}
                activeTool={activeTool}
                onPixelPick={handlePixelPick}
                sourceOverride={levelsPreview ?? convPreview ?? undefined}
                displayScale={displayScale}
                interpolation={interpolation}
                onScaleChange={setDisplayScale}
              />
              <div className="zoom-panel">
                <div className="zoom-row">
                  <input
                    type="range"
                    className="zoom-slider"
                    min={12} max={300} step={1}
                    value={scalePct}
                    onChange={e => setDisplayScale(+e.target.value / 100)}
                  />
                  <select
                    className="zoom-select zoom-pct-select"
                    value={SCALE_PRESETS.includes(scalePct as typeof SCALE_PRESETS[number]) ? scalePct : ''}
                    onChange={e => setDisplayScale(+e.target.value / 100)}
                  >
                    {!SCALE_PRESETS.includes(scalePct as typeof SCALE_PRESETS[number]) && (
                      <option value="">{scalePct}%</option>
                    )}
                    {SCALE_PRESETS.map(p => (
                      <option key={p} value={p}>{p}%</option>
                    ))}
                  </select>
                </div>
                <select
                  className="zoom-select"
                  value={interpolation}
                  onChange={e => setInterpolation(e.target.value as InterpolationMethod)}
                  title={INTERPOLATION_METHODS.find(m => m.key === interpolation)?.tooltip}
                >
                  {INTERPOLATION_METHODS.map(m => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="canvas-placeholder">
              <p>Загрузите изображение для начала</p>
            </div>
          )}
        </main>
      </div>

      {/* Dialogs */}
      {showLevels && imageData && levelsSnapshotData && (
        <LevelsDialog
          imageData={imageData}
          onPreview={handleLevelsPreview}
          onApply={handleLevelsApply}
          onClose={handleLevelsClose}
        />
      )}

      {showResize && imageData && (
        <ResizeDialog
          imageData={imageData}
          onApply={handleResizeApply}
          onClose={handleResizeClose}
        />
      )}

      {showConvolution && imageData && (
        <ConvolutionDialog
          imageData={imageData}
          onPreview={handleConvPreview}
          onApply={handleConvApply}
          onClose={handleConvClose}
        />
      )}

      <footer className="app-footer">
        <StatusBar imageData={imageData} fileName={fileName} compact />
        {imageData && (
          <span className="footer-scale">{scalePct}%</span>
        )}
      </footer>
    </div>
  );
}

export default App;
