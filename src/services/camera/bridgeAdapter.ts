import type { CameraAdapter, CameraCapabilities, CameraConnectionState, CapturedStill } from './types';

export class SonyBridgeAdapter implements CameraAdapter {
  readonly id: 'bridge-sony' | 'legacy-sony-wifi';
  readonly name: string;
  readonly description: string;

  private bridgeUrl = 'http://localhost:8765';
  private lastImgEl: HTMLImageElement | null = null;

  constructor(mode: 'bridge-sony' | 'legacy-sony-wifi' = 'bridge-sony') {
    this.id = mode;
    if (mode === 'legacy-sony-wifi') {
      this.name = 'Sony PlayMemories Wi-Fi (via Bridge)';
      this.description =
        'Proxies legacy Sony Camera Remote API (192.168.122.1:8080) through your local Bridge server.';
    } else {
      this.name = 'Sony DSLR / Mirrorless USB-C Bridge';
      this.description =
        'Connects via Local Bridge (PC/Mac/Raspberry Pi running gphoto2 / Sony SDK) for live view, shutter trigger, and full-res JPEG transfer.';
    }
  }

  getCapabilities(): CameraCapabilities {
    return {
      livePreview: true,
      remoteShutter: true,
      originalFileTransfer: true,
      gifCapture: true,
      notes:
        'Photos trigger the Sony shutter and transfer full-res mirrored JPEGs; 3-second countdown GIF bursts capture from Live View.',
    };
  }

  async connect(options?: { bridgeUrl?: string }): Promise<CameraConnectionState> {
    if (options?.bridgeUrl) {
      this.bridgeUrl = options.bridgeUrl.replace(/\/+$/, '');
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(`${this.bridgeUrl}/api/camera/status?mode=${this.id}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Bridge responded with HTTP ${res.status}`);
      }
      const status = await res.json();
      if (!status.cameraConnected) {
        throw new Error(status.message || 'Bridge is running, but no Sony camera was detected.');
      }
      return {
        connected: true,
        adapterId: this.id,
        adapterName: this.name,
        deviceLabel: status.cameraModel || 'Sony Camera via Bridge',
      };
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `Cannot reach Sony Bridge at ${this.bridgeUrl}. Start sony-bridge-server.mjs first.`
          : err instanceof Error
            ? err.message
            : 'Failed to reach Sony Bridge.';
      throw new Error(message);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async disconnect(): Promise<void> {
    this.lastImgEl = null;
  }

  async attachPreview(_videoEl: HTMLVideoElement | null, imgEl?: HTMLImageElement | null): Promise<void> {
    if (!imgEl) return;
    this.lastImgEl = imgEl;
    imgEl.crossOrigin = 'anonymous';
    imgEl.src = `${this.bridgeUrl}/api/camera/liveview.mjpg?t=${Date.now()}`;
  }

  async captureStill(
    _videoEl?: HTMLVideoElement | null,
    options?: { mirror?: boolean }
  ): Promise<CapturedStill> {
    const res = await fetch(`${this.bridgeUrl}/api/camera/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: this.id }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || 'Sony Bridge shutter capture failed.');
    }
    const rawBlob = await res.blob();
    const rawUrl = URL.createObjectURL(rawBlob);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('Failed to decode Bridge capture.'));
        im.src = rawUrl;
      });
      const width = img.naturalWidth || 1920;
      const height = img.naturalHeight || 1280;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable.');
      if (options?.mirror !== false) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to encode mirrored still.'))),
          'image/jpeg',
          0.95
        );
      });
      return {
        blob,
        dataUrl: canvas.toDataURL('image/jpeg', 0.95),
        width,
        height,
        source: 'sony-original',
      };
    } finally {
      URL.revokeObjectURL(rawUrl);
    }
  }
}
