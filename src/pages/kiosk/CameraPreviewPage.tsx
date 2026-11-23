import { ArrowLeft, Camera, RefreshCw, SlidersHorizontal, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCameraAdapter, listCameraAdapters } from '../../services/camera/cameraManager';
import type { CameraConnectionState, CameraDeviceOption } from '../../services/camera/types';
import type { BoothSettings, CameraAdapterId, CanvaFrame } from '../../types';

interface CameraPreviewPageProps {
  settings: BoothSettings;
  selectedFrame: CanvaFrame;
  onBackToFrames: () => void;
  onCaptureComplete: (payload: { photos: string[]; gifBurstsBySlot: string[][] }) => void;
}

export function CameraPreviewPage({
  settings,
  selectedFrame,
  onBackToFrames,
  onCaptureComplete,
}: CameraPreviewPageProps) {
  const [adapterId, setAdapterId] = useState<CameraAdapterId>(settings.camera_adapter);
  const [bridgeUrl, setBridgeUrl] = useState(settings.bridge_url || 'http://localhost:8765');
  const [devices, setDevices] = useState<CameraDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(settings.preferred_video_device_id || '');
  const [showAdapterDrawer, setShowAdapterDrawer] = useState(false);

  const [connState, setConnState] = useState<CameraConnectionState | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [capturingGifBurst, setCapturingGifBurst] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [shotIndex, setShotIndex] = useState<number>(0);
  const [showFrameGuide, setShowFrameGuide] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bridgeImgRef = useRef<HTMLImageElement | null>(null);
  const activeAdapterRef = useRef(getCameraAdapter(adapterId));

  const totalShotsNeeded = Math.max(1, selectedFrame.frame_layout?.length || 1);
  const countdownSeconds = Math.max(3, settings.default_countdown_sec || 10);
  const gifBurstSeconds = Math.min(countdownSeconds, Math.max(1, settings.gif_burst_seconds || 3));
  const isBridgeMode = adapterId === 'bridge-sony' || adapterId === 'legacy-sony-wifi';

  const connectCamera = useCallback(async () => {
    setConnecting(true);
    setErrorMsg(null);
    const prevAdapter = activeAdapterRef.current;
    await prevAdapter.disconnect().catch(() => {});

    const nextAdapter = getCameraAdapter(adapterId);
    activeAdapterRef.current = nextAdapter;

    try {
      const state = await nextAdapter.connect({
        bridgeUrl,
        deviceId: selectedDeviceId || undefined,
      });
      setConnState(state);
      if (nextAdapter.listDevices) {
        const list = await nextAdapter.listDevices();
        setDevices(list);
      }
      await nextAdapter.attachPreview(videoRef.current, bridgeImgRef.current);
    } catch (err) {
      setConnState({
        connected: false,
        adapterId,
        adapterName: nextAdapter.name,
        deviceLabel: 'Disconnected',
        error: err instanceof Error ? err.message : 'Camera connection failed.',
      });
      setErrorMsg(err instanceof Error ? err.message : 'Camera connection failed.');
    } finally {
      setConnecting(false);
    }
  }, [adapterId, bridgeUrl, selectedDeviceId]);

  useEffect(() => {
    connectCamera();
    return () => {
      activeAdapterRef.current.disconnect().catch(() => {});
    };
  }, [connectCamera]);

  useEffect(() => {
    if (connState?.connected) {
      activeAdapterRef.current.attachPreview(videoRef.current, bridgeImgRef.current).catch(() => {});
    }
  }, [connState?.connected]);

  const triggerFlash = () => {
    setFlashActive(true);
    window.setTimeout(() => setFlashActive(false), 180);
  };

  // Fast mirrored live-view sampler (does not trigger mechanical DSLR shutter during countdown)
  const captureLiveBurstFrame = (): string | null => {
    const videoEl = videoRef.current;
    const imgEl = bridgeImgRef.current;

    let srcW = 0;
    let srcH = 0;
    let source: HTMLVideoElement | HTMLImageElement | null = null;

    if (!isBridgeMode && videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
      srcW = videoEl.videoWidth;
      srcH = videoEl.videoHeight;
      source = videoEl;
    } else if (isBridgeMode && imgEl && imgEl.complete && imgEl.naturalWidth > 0) {
      srcW = imgEl.naturalWidth;
      srcH = imgEl.naturalHeight;
      source = imgEl;
    }

    if (!source || srcW <= 0 || srcH <= 0) return null;

    const maxW = 720;
    const scale = srcW > maxW ? maxW / srcW : 1;
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    try {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(source, 0, 0, w, h);
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      return null;
    }
  };

  // Run 10s countdown and capture GIF burst frames strictly during the final 3 seconds for each frame/shot
  const runCountdownWithGifBurst = async (
    seconds: number,
    gifSeconds: number,
    burstTarget: string[]
  ) => {
    const adapter = activeAdapterRef.current;
    for (let s = seconds; s >= 1; s--) {
      setCountdown(s);
      if (s <= gifSeconds) {
        setCapturingGifBurst(true);
        for (let k = 0; k < 3; k++) {
          const startedAt = Date.now();
          const liveFrame = captureLiveBurstFrame();
          if (liveFrame) {
            burstTarget.push(liveFrame);
          } else if (!isBridgeMode) {
            try {
              const snap = await adapter.captureStill(videoRef.current, { mirror: true });
              burstTarget.push(snap.dataUrl);
            } catch {
              // Skip busy frame
            }
          }
          const elapsed = Date.now() - startedAt;
          const remainingSlice = Math.max(0, 333 - elapsed);
          await new Promise((r) => setTimeout(r, remainingSlice));
        }
      } else {
        setCapturingGifBurst(false);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    setCapturingGifBurst(false);
    setCountdown(null);
  };

  const handleStartCapture = async () => {
    if (isCapturing || !connState?.connected) return;
    const adapter = activeAdapterRef.current;
    setIsCapturing(true);
    setErrorMsg(null);

    try {
      const collectedPhotos: string[] = [];
      const collectedBurstsBySlot: string[][] = [];

      for (let i = 0; i < totalShotsNeeded; i++) {
        setShotIndex(i);
        const shotBurst: string[] = [];
        await runCountdownWithGifBurst(countdownSeconds, gifBurstSeconds, shotBurst);

        triggerFlash();
        const still = await adapter.captureStill(videoRef.current, { mirror: true });
        collectedPhotos.push(still.dataUrl);
        shotBurst.push(still.dataUrl);
        collectedBurstsBySlot.push(shotBurst);

        if (i < totalShotsNeeded - 1) {
          await new Promise((r) => setTimeout(r, 900));
        }
      }

      onCaptureComplete({
        photos: collectedPhotos,
        gifBurstsBySlot: collectedBurstsBySlot,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Capture failed. Please retry.');
    } finally {
      setCountdown(null);
      setCapturingGifBurst(false);
      setIsCapturing(false);
    }
  };

  const activeSlot = selectedFrame.frame_layout?.[shotIndex] || selectedFrame.frame_layout?.[0];

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col">
      {/* Top Bar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4 border-b border-[#EFEAEC]">
        <button
          type="button"
          onClick={onBackToFrames}
          disabled={isCapturing}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-sm font-medium text-zinc-800 hover:text-[#7A1C2C] inline-flex items-center gap-2 disabled:opacity-40 whitespace-nowrap shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Frames</span>
        </button>

        <div className="flex items-center gap-2 text-xs sm:text-sm">
          {connState?.connected ? (
            <Wifi className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <WifiOff className="w-4 h-4 text-[#7A1C2C] shrink-0" />
          )}
          <span className="font-medium text-zinc-800 truncate max-w-[220px] sm:max-w-xs">
            {connecting ? 'Connecting...' : connState?.deviceLabel || 'Camera Offline'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowAdapterDrawer((v) => !v)}
          disabled={isCapturing}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-xs sm:text-sm font-medium text-zinc-800 hover:text-[#7A1C2C] inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Camera</span>
        </button>
      </header>

      {/* Camera Adapter Drawer */}
      {showAdapterDrawer && (
        <div className="w-full bg-[#FBF9FA] border-b border-[#EFEAEC] px-6 py-5">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                Camera Adapter
              </label>
              <select
                value={adapterId}
                onChange={(e) => setAdapterId(e.target.value as CameraAdapterId)}
                className="w-full min-h-[44px] rounded-xl bg-white border border-[#E5DADF] px-3 text-sm text-zinc-900"
              >
                {listCameraAdapters().map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            {isBridgeMode ? (
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                  Bridge URL
                </label>
                <input
                  type="url"
                  value={bridgeUrl}
                  onChange={(e) => setBridgeUrl(e.target.value)}
                  placeholder="http://192.168.1.50:8765"
                  className="w-full min-h-[44px] rounded-xl bg-white border border-[#E5DADF] px-3 text-sm text-zinc-900 font-mono"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                  Video Input
                </label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl bg-white border border-[#E5DADF] px-3 text-sm text-zinc-900"
                >
                  <option value="">Default Camera</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={connectCamera}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white font-semibold text-sm inline-flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reconnect</span>
              </button>
              <button
                type="button"
                onClick={() => setShowFrameGuide((g) => !g)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-[#E5DADF] bg-white text-sm text-zinc-800"
              >
                {showFrameGuide ? 'Hide Guide' : 'Show Guide'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Live View Viewport (Mirrored) */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col items-center justify-center gap-5">
        <div className="relative w-full max-w-4xl aspect-[4/3] sm:aspect-[16/10] rounded-3xl overflow-hidden bg-[#FBF9FA] border border-[#EFEAEC] shadow-lg flex items-center justify-center">
          {/* Live Video / MJPEG Stream — Mirrored (never use display:none so Safari/Chrome play() starts cleanly) */}
          {isBridgeMode ? (
            <img
              ref={bridgeImgRef}
              alt="Live Preview"
              style={{ transform: 'scaleX(-1)' }}
              className={`w-full h-full object-contain transition-opacity ${
                connState?.connected ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ transform: 'scaleX(-1)' }}
              className={`w-full h-full object-cover transition-opacity ${
                connState?.connected ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            />
          )}

          {/* Optional Frame Alignment Guide */}
          {connState?.connected && showFrameGuide && activeSlot && (
            <div
              className="pointer-events-none absolute inset-4 border-2 border-dashed border-[#7A1C2C]/45 rounded-2xl"
              aria-hidden="true"
            />
          )}

          {/* Disconnected State Overlay */}
          {!connState?.connected && !connecting && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[#FBF9FA]/95 z-10">
              <p className="font-display text-xl font-semibold text-zinc-950">Camera Offline</p>
              {errorMsg && (
                <p className="mt-2 text-sm text-zinc-600 max-w-md leading-relaxed">{errorMsg}</p>
              )}
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={connectCamera}
                  className="min-h-[48px] px-6 py-2.5 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white font-semibold text-sm inline-flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry Camera</span>
                </button>
                {adapterId !== 'browser-webcam' && (
                  <button
                    type="button"
                    onClick={() => setAdapterId('browser-webcam')}
                    className="min-h-[48px] px-5 py-2.5 rounded-xl border border-[#E5DADF] bg-white text-sm text-zinc-800 hover:bg-[#FDF2F4]"
                  >
                    Use Device Camera
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Countdown + Final 3s GIF Indicator */}
          {countdown !== null && (
            <div className="absolute inset-0 bg-white/25 flex flex-col items-center justify-center pointer-events-none">
              <div className="font-display text-[8rem] sm:text-[11rem] font-bold text-[#7A1C2C] drop-shadow-[0_4px_24px_rgba(255,255,255,0.95)] tabular-nums leading-none">
                {countdown}
              </div>
              {capturingGifBurst && (
                <div className="mt-4 px-4 py-1.5 rounded-xl bg-[#7A1C2C] text-white text-xs font-bold uppercase tracking-widest">
                  GIF
                </div>
              )}
            </div>
          )}

          {/* Flash Overlay */}
          {flashActive && <div className="absolute inset-0 bg-white pointer-events-none" />}
        </div>

        {errorMsg && connState?.connected && (
          <p className="text-sm text-[#7A1C2C]">{errorMsg}</p>
        )}

        {/* Bottom Shutter Action Bar */}
        <div className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm font-mono tabular-nums font-medium text-zinc-700">
            Shot {shotIndex + 1} / {totalShotsNeeded}
          </div>

          <button
            type="button"
            onClick={handleStartCapture}
            disabled={!connState?.connected || isCapturing}
            className="min-h-[64px] px-11 py-4 rounded-2xl bg-[#7A1C2C] hover:bg-[#611421] active:scale-[0.98] text-white font-display font-bold text-xl inline-flex items-center gap-3 shadow-xl shadow-[#7A1C2C]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all whitespace-nowrap"
          >
            <Camera className="w-6 h-6" />
            <span>{isCapturing ? `${countdown ?? ''}...` : 'Take Photo'}</span>
          </button>

          <div className="text-xs text-zinc-500 hidden sm:block">
            {selectedFrame.frame_name}
          </div>
        </div>
      </main>
    </div>
  );
}
