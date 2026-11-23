import type { CameraAdapter, CameraCapabilities, CameraConnectionState, CameraDeviceOption, CapturedStill } from './types';

export class UvcCaptureAdapter implements CameraAdapter {
  readonly id = 'uvc-hdmi' as const;
  readonly name = 'Sony HDMI ➔ USB-C Capture Card (UVC)';
  readonly description =
    'Uses an HDMI-to-USB-C UVC Capture Card plugged into iPad/Mac for Sony Clean HDMI live view, mirror stills, and 3s GIF burst.';

  private stream: MediaStream | null = null;
  private selectedDeviceId: string | undefined;

  getCapabilities(): CameraCapabilities {
    return {
      livePreview: true,
      remoteShutter: false,
      originalFileTransfer: false,
      gifCapture: true,
      notes:
        'Captures Clean HDMI stills & 3-second countdown GIF bursts in mirror mode directly on iPad Safari.',
    };
  }

  async listDevices(): Promise<CameraDeviceOption[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, idx) => ({
        deviceId: d.deviceId,
        label: d.label || `Video Input ${idx + 1}`,
      }));
  }

  async connect(options?: { deviceId?: string }): Promise<CameraConnectionState> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        window.isSecureContext
          ? 'Camera API is unavailable in this browser or blocked by iframe permissions.'
          : 'Camera access requires HTTPS (or localhost). Open the HTTPS URL to enable the camera.'
      );
    }

    await this.disconnect();
    this.selectedDeviceId = options?.deviceId;

    const attempts: MediaStreamConstraints[] = [];
    if (this.selectedDeviceId) {
      attempts.push({
        video: { deviceId: { exact: this.selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      attempts.push({
        video: { deviceId: { exact: this.selectedDeviceId } },
        audio: false,
      });
    }
    attempts.push({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: { ideal: 'user' } },
      audio: false,
    });
    attempts.push({
      video: { facingMode: 'user' },
      audio: false,
    });
    attempts.push({
      video: true,
      audio: false,
    });

    let lastErr: unknown = null;
    for (const constraints of attempts) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err) {
        lastErr = err;
        // Stop immediately on explicit permission denial rather than retrying
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
          throw new Error(
            'Camera permission was denied or blocked by the browser/iframe. Allow Camera access in site settings and click Retry.'
          );
        }
      }
    }

    if (!this.stream) {
      const msg = lastErr instanceof Error ? lastErr.message : 'Unable to start camera stream.';
      throw new Error(msg);
    }

    const track = this.stream.getVideoTracks()[0];
    return {
      connected: true,
      adapterId: this.id,
      adapterName: this.name,
      deviceLabel: track?.label || 'Camera Active',
    };
  }

  async disconnect(): Promise<void> {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  async attachPreview(videoEl: HTMLVideoElement | null): Promise<void> {
    if (!videoEl || !this.stream) return;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', 'true');
    videoEl.setAttribute('webkit-playsinline', 'true');
    if (videoEl.srcObject !== this.stream) {
      videoEl.srcObject = this.stream;
    }
    if (videoEl.readyState < 1) {
      await new Promise<void>((resolve) => {
        const done = () => {
          videoEl.removeEventListener('loadedmetadata', done);
          resolve();
        };
        videoEl.addEventListener('loadedmetadata', done, { once: true });
        window.setTimeout(resolve, 1200);
      });
    }
    await videoEl.play().catch(() => {});
  }

  async captureStill(
    videoEl?: HTMLVideoElement | null,
    options?: { mirror?: boolean }
  ): Promise<CapturedStill> {
    if (!videoEl || !this.stream) {
      throw new Error('Live video stream is not active.');
    }
    const width = videoEl.videoWidth || 1920;
    const height = videoEl.videoHeight || 1080;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to initialize canvas 2D context.');

    if (options?.mirror !== false) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(videoEl, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode captured frame.'))),
        'image/jpeg',
        0.95
      );
    });

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    return {
      blob,
      dataUrl,
      width,
      height,
      source: 'uvc-capture',
    };
  }
}
