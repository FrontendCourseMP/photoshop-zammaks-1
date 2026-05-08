import { useState } from 'react';
import ImageCanvas from './components/ImageCanvas';
import ImageUpload from './components/ImageUpload';
import StatusBar from './components/StatusBar';
import type { ImageData } from './types';
import { exportToPNG, exportToJPG } from './imageFormats';
import { encodeGB7 } from './gb7';
import './App.css';

function App() {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [exporting, setExporting] = useState(false);

  const handleImageLoaded = (data: ImageData, name: string) => {
    setImageData(data);
    setFileName(name);
  };

  const handleReset = () => {
    setImageData(null);
    setFileName('');
  };

  const handleExport = async (format: 'png' | 'jpg' | 'gb7') => {
    if (!imageData) return;
    setExporting(true);
    try {
      let blob: Blob;
      let ext: string;

      if (format === 'png') {
        blob = await exportToPNG(imageData);
        ext = '.png';
      } else if (format === 'jpg') {
        blob = await exportToJPG(imageData);
        ext = '.jpg';
      } else {
        blob = new Blob([encodeGB7(imageData)], { type: 'application/octet-stream' });
        ext = '.gb7';
      }

      const baseName = fileName.split('.')[0] || 'image';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${baseName}${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      alert('Ошибка при экспорте');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Обработчик Изображений</h1>
      </header>

      <div className="app-container">
        <aside className="left-panel">
          <ImageUpload onImageLoaded={handleImageLoaded} onReset={handleReset} />

          {imageData && (
            <div className="export-section">
              <span className="export-label">Экспорт</span>
              <div className="export-buttons">
                <button onClick={() => handleExport('png')} disabled={exporting} className="btn btn-png">PNG</button>
                <button onClick={() => handleExport('jpg')} disabled={exporting} className="btn btn-jpg">JPG</button>
                <button onClick={() => handleExport('gb7')} disabled={exporting} className="btn btn-gb7">GB7</button>
              </div>
              {exporting && <span className="export-status">Экспорт...</span>}
            </div>
          )}
        </aside>

        <main className="main-content">
          {imageData ? (
            <ImageCanvas imageData={imageData} />
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
