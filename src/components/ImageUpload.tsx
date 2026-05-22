import { useRef, useState } from 'react';
import type { ImageData } from '../types';
import { loadPNGorJPG } from '../imageFormats';
import { decodeGB7 } from '../gb7';
import '../styles/ImageUpload.css';

interface ImageUploadProps {
  onImageLoaded: (data: ImageData, fileName: string) => void;
  onReset: () => void;
}

const ImageUpload = ({ onImageLoaded, onReset }: ImageUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const processFile = async (file: File) => {
    setError('');
    setLoading(true);
    try {
      const fileName = file.name;
      const nameLower = fileName.toLowerCase();
      let imageData: ImageData;

      if (file.type === 'image/png' || nameLower.endsWith('.png')) {
        imageData = await loadPNGorJPG(file);
      } else if (
        file.type === 'image/jpeg' ||
        nameLower.endsWith('.jpg') ||
        nameLower.endsWith('.jpeg')
      ) {
        imageData = await loadPNGorJPG(file);
      } else if (nameLower.endsWith('.gb7')) {
        imageData = decodeGB7(await file.arrayBuffer());
      } else {
        throw new Error('Неподдерживаемый формат. Используйте PNG, JPG или GB7');
      }

      onImageLoaded(imageData, fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при загрузке файла');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleReset = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError('');
    onReset();
  };

  return (
    <div className="image-upload">
      <div
        className="upload-area"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="upload-icon">📁</div>
        <p className="upload-title">Открыть</p>
        <p className="upload-hint">PNG · JPG · GB7</p>
        {loading && <p className="upload-loading">Загрузка...</p>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.gb7,image/png,image/jpeg"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {error && <div className="upload-error">{error}</div>}

      <div className="upload-actions">
        <button onClick={handleReset} className="btn btn-reset">Очистить</button>
      </div>
    </div>
  );
};

export default ImageUpload;
