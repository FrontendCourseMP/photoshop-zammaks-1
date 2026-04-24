import { useState } from 'react';
import ImageCanvas from './components/ImageCanvas';
import ImageUpload from './components/ImageUpload';
import StatusBar from './components/StatusBar';
import type { ImageData } from './types';
import './App.css';

function App() {
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [fileName, setFileName] = useState<string>('');

  const handleImageLoaded = (data: ImageData, name: string) => {
    setImageData(data);
    setFileName(name);
  };

  const handleReset = () => {
    setImageData(null);
    setFileName('');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Обработчик Изображений</h1>
      </header>

      <div className="app-container">
        <aside className="left-panel">
          <ImageUpload onImageLoaded={handleImageLoaded} onReset={handleReset} />
        </aside>

        <main className="main-content">
          {imageData ? (
            <ImageCanvas imageData={imageData} fileName={fileName} />
          ) : (
            <div className="canvas-placeholder">
              <p>Загрузите изображение для начала</p>
            </div>
          )}
        </main>

        <aside className="right-panel">
          <div className="panel-content">
            <h3>Информация</h3>
            <StatusBar imageData={imageData} fileName={fileName} />
          </div>
        </aside>
      </div>

      <footer className="app-footer">
        <StatusBar imageData={imageData} fileName={fileName} compact={true} />
      </footer>
    </div>
  );
}

export default App;
