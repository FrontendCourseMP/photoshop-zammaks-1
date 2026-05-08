import { useEffect, useRef } from 'react';
import type { ImageData } from '../types';
import type { Channel, ChannelKey } from '../channelUtils';
import { renderChannelThumbnail } from '../channelUtils';
import '../styles/ChannelPanel.css';

const THUMB_W = 80; // фиксированный размер миниатюры
const THUMB_H = 56;

interface ThumbProps {
  imageData: ImageData;
  channelKey: ChannelKey;
  label: string;
  active: boolean;
  onToggle: () => void;
}

const ChannelThumb = ({ imageData, channelKey, label, active, onToggle }: ThumbProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, data } = imageData;

    canvas.width  = THUMB_W;
    canvas.height = THUMB_H;

    const pixels = renderChannelThumbnail(data, width, height, channelKey, THUMB_W, THUMB_H);
    // ctx.createImageData возвращает ImageData с правильным типом Uint8ClampedArray
    const imgData = ctx.createImageData(THUMB_W, THUMB_H);
    imgData.data.set(pixels);
    ctx.putImageData(imgData, 0, 0);
  }, [imageData, channelKey]);

  return (
    <div
      className={`ch-item${active ? ' active' : ''}`}
      onClick={onToggle}
      title={`${label}: ${active ? 'включён' : 'выключен'} (клик для переключения)`}
    >
      <canvas ref={canvasRef} className="ch-thumb" />
      <span className="ch-label">{label}</span>
    </div>
  );
};

interface ChannelPanelProps {
  imageData: ImageData;
  channels: Channel[];
  activeChannels: Set<ChannelKey>;
  onToggleChannel: (key: ChannelKey) => void;
}

const ChannelPanel = ({ imageData, channels, activeChannels, onToggleChannel }: ChannelPanelProps) => (
  <div className="channel-panel">
    <span className="section-label">Каналы</span>
    <div className="ch-grid">
      {channels.map(ch => (
        <ChannelThumb
          key={ch.key}
          imageData={imageData}
          channelKey={ch.key}
          label={ch.label}
          active={activeChannels.has(ch.key)}
          onToggle={() => onToggleChannel(ch.key)}
        />
      ))}
    </div>
  </div>
);

export default ChannelPanel;
