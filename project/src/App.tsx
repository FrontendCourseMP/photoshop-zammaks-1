import { useState } from 'react';
import ImageCanvas from './components/ImageCanvas';
import ImageUpload from './components/ImageUpload';
import StatusBar from './components/StatusBar';
import ChannelPanel from './components/ChannelPanel';
import type { ImageData } from './types';
import type { ChannelKey } from './channelUtils';
import { getChannels } from './channelUtils';
import { rgbToLab } from './colorUtils';
import { exportToPNG, exportToJPG } from './imageFormats';
import { encodeGB7 } from './gb7';
import './App.css';

interface PickedPixel {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  L: number;
  labA: number;
  labB: number;
}

function App() {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [fileName, setFileName] = useState('');
  const [exporting, setExporting] = useState(false);
  const [activeChannels, setActiveChannels] = useState<Set<ChannelKey>>(new Set());
  const [activeTool, setActiveTool] = useState<'eyedropper' | null>(null);
  const [pickedPixel, setPickedPixel] = useState<PickedPixel | null>(null);

  const handleImageLoaded = (data: ImageData, name: string) => {
    const channels = getChannels(data);
    setActiveChannels(new Set(channels.map(c => c.key)));
    setPickedPixel(null);
    setImageData(data);
    setFileName(name);
  };

  const handleReset = () => {
    setImageData(null);
    setFileName('');
    setActiveChannels(new Set());
    setPickedPixel(null);
    setActiveTool(null);
  };

  const handleToggleChannel = (key: ChannelKey) => {
    setActiveChannels(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleToggleEyedropper = () => {
    setActiveTool(t => (t === 'eyedropper' ? null : 'eyedropper'));
  };

  const handlePixelPick = (x: number, y: number, r: number, g: number, b: number) => {
    const lab = rgbToLab(r, g, b);
    setPickedPixel({ x, y, r, g, b, L: lab.L, labA: lab.a, labB: lab.b });
  };

  const handleExport = async (format: 'png' | 'jpg' | 'gb7') => {
    if (!imageData) return;
    setExporting(true);
    try {
      let blob: Blob;
      let ext: string;
      if (format === 'png') {
        blob = await exportToPNG(imageData); ext = '.png';
      } else if (format === 'jpg') {
        blob = await exportToJPG(imageData); ext = '.jpg';
      } else {
        blob = new Blob([encodeGB7(imageData)], { type: 'application/octet-stream' }); ext = '.gb7';
      }
      const base = fileName.split('.')[0] || 'image';
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `${base}${ext}`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch {
      alert('Ошибка при экспорте');
    } finally {
      setExporting(false);
    }
  };

  const channels = imageData ? getChannels(imageData) : [];

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
                    title="Кликните по холсту для считывания цвета пикселя"
                  >
                    Пипетка
                  </button>
                </div>
              </div>

              {/* Каналы */}
              <ChannelPanel
                imageData={imageData}
                channels={channels}
                activeChannels={activeChannels}
                onToggleChannel={handleToggleChannel}
              />

              {/* Информация о пикселе */}
              {pickedPixel && (
                <div className="side-section pixel-info">
                  <span className="section-label">Пиксель</span>
                  <div className="px-row">
                    <div
                      className="px-swatch"
                      style={{ background: `rgb(${pickedPixel.r},${pickedPixel.g},${pickedPixel.b})` }}
                    />
                    <div className="px-grid">
                      <span className="px-key">X</span><span className="px-val">{pickedPixel.x}</span>
                      <span className="px-key">Y</span><span className="px-val">{pickedPixel.y}</span>
                      <span className="px-key">R</span><span className="px-val">{pickedPixel.r}</span>
                      <span className="px-key">G</span><span className="px-val">{pickedPixel.g}</span>
                      <span className="px-key">B</span><span className="px-val">{pickedPixel.b}</span>
                      <span className="px-key">L*</span><span className="px-val">{pickedPixel.L.toFixed(1)}</span>
                      <span className="px-key">a*</span><span className="px-val">{pickedPixel.labA.toFixed(1)}</span>
                      <span className="px-key">b*</span><span className="px-val">{pickedPixel.labB.toFixed(1)}</span>
                    </div>
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
                {exporting && <span className="export-status">Экспорт...</span>}
              </div>
            </>
          )}
        </aside>

        <main className="main-content">
          {imageData ? (
            <ImageCanvas
              imageData={imageData}
              activeChannels={activeChannels}
              activeTool={activeTool}
              onPixelPick={handlePixelPick}
            />
          ) : (
            <div className="canvas-placeholder">
              <p>Загрузите изображение для начала</p>
            </div>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <StatusBar imageData={imageData} fileName={fileName} compact />
      </footer>
    </div>
  );
}

export default App;
