import { applyKernel, type EdgeHandling, type ConvolutionChannel } from '../convolutionUtils';

interface WorkerRequest {
  id: number;
  data: Uint8Array;
  width: number;
  height: number;
  kernel: number[][];
  activeChannels: ConvolutionChannel[];
  edge: EdgeHandling;
  grayscale: boolean;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, data, width, height, kernel, activeChannels, edge, grayscale } = e.data;
  const channelSet = new Set<ConvolutionChannel>(activeChannels);
  const result = applyKernel(data, width, height, kernel, channelSet, edge, grayscale);
  (self as unknown as Worker).postMessage({ id, result }, [result.buffer]);
};
