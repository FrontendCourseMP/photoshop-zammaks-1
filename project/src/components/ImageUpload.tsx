import { useRef, useState } from 'react';
import type { ImageData } from '../types';
import { loadPNGorJPG } from '../imageFormats';
import { decodeGB7 } from '../gb7';
import '../styles/ImageUpload.css';

interface ImageUploadProps {
  onImageLoaded: (data: ImageData, fileName: string) => void;
  onReset: () => void;
}

const ImageUpload = ({
  onImageLoaded,
  onReset,
}: ImageUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setError('');
    setLoading(true);

    try {
      let imageData: ImageData;
      const fileName = file.name;

      if (file.type === 'image/png' || fileName.toLowerCase().endsWith('.png')) {
        imageData = await loadPNGorJPG(file);
      } else if (file.type === 'image/jpeg' || fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) {
        imageData = await loadPNGorJPG(file);
      } else if (fileName.toLowerCase().endsWith('.gb7')) {
        const arrayBuffer = await file.arrayBuffer();
        imageData = decodeGB7(arrayBuffer);
      } else {
        throw new Error(
          'Неподдерживаемый формат. Используйте PNG, JPG или GB7'
        );
      }

      onImageLoaded(imageData, fileName);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Ошибка при загрузке файла';
      setError(errorMessage);
      console.error('Ошибка загрузки:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    setError('');
    setLoading(true);

    try {
      let imageData: ImageData;
      const fileName = file.name;

      if (file.type === 'image/png' || fileName.toLowerCase().endsWith('.png')) {
        imageData = await loadPNGorJPG(file);
      } else if (file.type === 'image/jpeg' || fileName.toLowerCase().endsWith('.jpg') || fileName.toLowerCase().endsWith('.jpeg')) {
        imageData = await loadPNGorJPG(file);
      } else if (fileName.toLowerCase().endsWith('.gb7')) {
        const arrayBuffer = await file.arrayBuffer();
        imageData = decodeGB7(arrayBuffer);
      } else {
        throw new Error(
          'Неподдерживаемый формат. Используйте PNG, JPG или GB7'
        );
      }

      onImageLoaded(imageData, fileName);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Ошибка при загрузке файла';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
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
        <h2>Открыть</h2>
        <p>PNG, JPG, GB7</p>
        <p className="highlight">или Drag & Drop</p>
        {loading && <p className="loading">Загрузка...</p>}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.gb7,image/png,image/jpeg"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {error && <div className="error">{error}</div>}

      <div className="button-group">
        <button
          onClick={() => {
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
            onReset();
          }}
          className="btn btn-reset"
        >
          Очистить
        </button>
      </div>
    </div>
  );
};

export default ImageUpload;
