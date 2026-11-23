import type { CameraAdapterId } from '../../types';

export interface CameraCapabilities {
  livePreview: boolean;
  remoteShutter: boolean;
  originalFileTransfer: boolean;
  gifCapture: boolean;
  notes: string;
}

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

export interface CapturedStill {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  source: 'sony-original' | 'uvc-capture' | 'device-webcam';
}

export interface CameraConnectionState {
  connected: boolean;
  adapterId: CameraAdapterId;
  adapterName: string;
  deviceLabel: string;
  error?: string;
}

export interface CameraAdapter {
  readonly id: CameraAdapterId;
  readonly name: string;
  readonly description: string;
  getCapabilities(): CameraCapabilities;
  listDevices?(): Promise<CameraDeviceOption[]>;
  connect(options?: { bridgeUrl?: string; deviceId?: string }): Promise<CameraConnectionState>;
  disconnect(): Promise<void>;
  attachPreview(videoEl: HTMLVideoElement | null, imgEl?: HTMLImageElement | null): Promise<void>;
  captureStill(videoEl?: HTMLVideoElement | null, options?: { mirror?: boolean }): Promise<CapturedStill>;
}
