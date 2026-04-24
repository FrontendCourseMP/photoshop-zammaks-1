import type { ImageData } from '../types';
import '../styles/StatusBar.css';

interface StatusBarProps {
  imageData: ImageData | null;
  fileName: string;
  compact?: boolean;
}

const StatusBar = ({ imageData, fileName, compact = false }: StatusBarProps) => {
  const className = `status-bar ${compact ? 'compact' : ''}`;

  return (
    <div className={className}>
      {imageData ? (
        <div className="status-content">
          <div className="status-item">
            <span className="status-label">Файл</span>
            <span className="status-value">{fileName}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Размер</span>
            <span className="status-value">{imageData.width} × {imageData.height} px</span>
          </div>
          <div className="status-item">
            <span className="status-label">Глубина цвета</span>
            <span className="status-value">{imageData.depth} бит</span>
          </div>
          {imageData.hasAlpha && (
            <div className="status-item">
              <span className="status-label">Прозрачность</span>
              <span className="status-value">Да</span>
            </div>
          )}
        </div>
      ) : (
        <div className="status-content">
          <span className="status-label">Нет данных</span>
        </div>
      )}
    </div>
  );
};

export default StatusBar;
