import type { CameraAdapterId } from '../../types';
import { SonyBridgeAdapter } from './bridgeAdapter';
import { BrowserWebcamAdapter } from './browserWebcamAdapter';
import type { CameraAdapter } from './types';
import { UvcCaptureAdapter } from './uvcCaptureAdapter';

const adapters: Record<CameraAdapterId, CameraAdapter> = {
  'bridge-sony': new SonyBridgeAdapter('bridge-sony'),
  'uvc-hdmi': new UvcCaptureAdapter(),
  'legacy-sony-wifi': new SonyBridgeAdapter('legacy-sony-wifi'),
  'browser-webcam': new BrowserWebcamAdapter(),
};

export function getCameraAdapter(id: CameraAdapterId): CameraAdapter {
  return adapters[id] || adapters['uvc-hdmi'];
}

export function listCameraAdapters(): CameraAdapter[] {
  return [
    adapters['bridge-sony'],
    adapters['uvc-hdmi'],
    adapters['legacy-sony-wifi'],
    adapters['browser-webcam'],
  ];
}
