import { UvcCaptureAdapter } from './uvcCaptureAdapter';
import type { CameraAdapter, CameraCapabilities, CameraConnectionState, CameraDeviceOption, CapturedStill } from './types';

export class BrowserWebcamAdapter implements CameraAdapter {
  readonly id = 'browser-webcam' as const;
  readonly name = 'Device Built-in Camera (Fallback / Testing)';
  readonly description =
    'Uses the built-in iPad or laptop camera directly via Safari/Chrome WebRTC in mirror mode.';

  private inner = new UvcCaptureAdapter();

  getCapabilities(): CameraCapabilities {
    return {
      livePreview: true,
      remoteShutter: false,
      originalFileTransfer: false,
      gifCapture: true,
      notes:
        'Using built-in device camera in mirror mode with 10s countdown and 3s GIF burst.',
    };
  }

  listDevices(): Promise<CameraDeviceOption[]> {
    return this.inner.listDevices();
  }

  async connect(options?: { deviceId?: string }): Promise<CameraConnectionState> {
    const state = await this.inner.connect(options);
    return {
      ...state,
      adapterId: this.id,
      adapterName: this.name,
    };
  }

  disconnect(): Promise<void> {
    return this.inner.disconnect();
  }

  attachPreview(videoEl: HTMLVideoElement | null): Promise<void> {
    return this.inner.attachPreview(videoEl);
  }

  async captureStill(
    videoEl?: HTMLVideoElement | null,
    options?: { mirror?: boolean }
  ): Promise<CapturedStill> {
    const still = await this.inner.captureStill(videoEl, options);
    return { ...still, source: 'device-webcam' };
  }
}
