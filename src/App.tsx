import { useCallback, useEffect, useState } from 'react';
import { MobileDownloadPage } from './pages/MobileDownloadPage';
import { StaffStationPage } from './pages/StaffStationPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminGate } from './pages/admin/AdminGate';
import { CameraPreviewPage } from './pages/kiosk/CameraPreviewPage';
import { FrameSelectionPage } from './pages/kiosk/FrameSelectionPage';
import { GeneratingPage } from './pages/kiosk/GeneratingPage';
import { PhotoComposerPage } from './pages/kiosk/PhotoComposerPage';
import { QrDownloadPage } from './pages/kiosk/QrDownloadPage';
import { WelcomePage } from './pages/kiosk/WelcomePage';
import { adminApi, kioskApi } from './services/apiClient';
import type { BoothSession, BoothSettings, CanvaFrame, MediaItem } from './types';

type KioskStep = 'welcome' | 'frames' | 'camera' | 'compose' | 'generating' | 'qr';

function parseRoute(
  pathname: string
): { route: 'kiosk' | 'admin' | 'station' | 'download'; token?: string } {
  if (pathname.startsWith('/admin')) return { route: 'admin' };
  if (pathname.startsWith('/station')) return { route: 'station' };
  const dlMatch = pathname.match(/^\/download\/([^/]+)/);
  if (dlMatch) return { route: 'download', token: decodeURIComponent(dlMatch[1]) };
  return { route: 'kiosk' };
}

export default function App() {
  const [locationPath, setLocationPath] = useState<string>(() => window.location.pathname);

  // Kiosk Config & State
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [settings, setSettings] = useState<BoothSettings | null>(null);
  const [frames, setFrames] = useState<CanvaFrame[]>([]);

  // Active Kiosk Session Flow (Unified Photo + 3s GIF, Mirror, No Retake)
  const [step, setStep] = useState<KioskStep>('welcome');
  const [selectedFrame, setSelectedFrame] = useState<CanvaFrame | null>(null);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [gifBurstsBySlot, setGifBurstsBySlot] = useState<string[][]>([]);
  const [completedResult, setCompletedResult] = useState<{
    session: BoothSession;
    media: MediaItem[];
  } | null>(null);

  // Admin / Staff Auth State
  const [adminAuth, setAdminAuth] = useState<{
    checked: boolean;
    mode: 'env' | 'claimed' | 'unclaimed';
    authenticated: boolean;
  }>({ checked: false, mode: 'unclaimed', authenticated: false });

  useEffect(() => {
    const onPopState = () => setLocationPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (window.location.pathname !== to) {
      window.history.pushState({}, '', to);
    }
    setLocationPath(to);
  }, []);

  const loadKioskConfig = useCallback(async () => {
    setLoadingConfig(true);
    setConfigError(null);
    try {
      const res = await kioskApi.getConfig();
      setSettings(res.settings);
      setFrames(res.frames);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Unable to reach BoostBooth server.');
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadKioskConfig();
  }, [loadKioskConfig]);

  const checkAdminAuth = useCallback(async () => {
    try {
      const status = await adminApi.getAuthStatus();
      setAdminAuth({ checked: true, mode: status.mode, authenticated: status.authenticated });
    } catch {
      setAdminAuth({ checked: true, mode: 'claimed', authenticated: false });
    }
  }, []);

  const current = parseRoute(locationPath);

  useEffect(() => {
    if (current.route === 'admin' || current.route === 'station') {
      checkAdminAuth();
    }
  }, [current.route, checkAdminAuth]);

  const resetKioskSession = useCallback(() => {
    setStep('welcome');
    setSelectedFrame(null);
    setCapturedPhotos([]);
    setGifBurstsBySlot([]);
    setCompletedResult(null);
  }, []);

  // --- Route: Public Mobile Download Page (/download/:token) ---
  if (current.route === 'download' && current.token) {
    return <MobileDownloadPage token={current.token} />;
  }

  // --- Route: Parallel Staff AirDrop & File Manager Station (/station) ---
  if (current.route === 'station') {
    if (!adminAuth.checked) {
      return (
        <div className="min-h-screen bg-white text-zinc-600 flex items-center justify-center text-sm">
          Checking staff station session...
        </div>
      );
    }
    if (!adminAuth.authenticated) {
      return (
        <AdminGate
          mode={adminAuth.mode}
          onAuthenticated={() => setAdminAuth((prev) => ({ ...prev, authenticated: true }))}
          onExitToKiosk={() => navigate('/')}
        />
      );
    }
    return (
      <StaffStationPage
        onOpenKiosk={() => navigate('/')}
        onOpenAdmin={() => navigate('/admin')}
      />
    );
  }

  // --- Route: Admin Dashboard (/admin) ---
  if (current.route === 'admin') {
    if (!adminAuth.checked) {
      return (
        <div className="min-h-screen bg-white text-zinc-600 flex items-center justify-center text-sm">
          Checking administrator session...
        </div>
      );
    }
    if (!adminAuth.authenticated) {
      return (
        <AdminGate
          mode={adminAuth.mode}
          onAuthenticated={() => setAdminAuth((prev) => ({ ...prev, authenticated: true }))}
          onExitToKiosk={() => navigate('/')}
        />
      );
    }
    return (
      <AdminDashboard
        onExitToKiosk={() => navigate('/')}
        onOpenStation={() => navigate('/station')}
        onSettingsChanged={loadKioskConfig}
      />
    );
  }

  // --- Route: Kiosk Flow (/) ---
  if (loadingConfig || !settings) {
    return (
      <div className="min-h-screen bg-white text-zinc-600 flex flex-col items-center justify-center p-6">
        <p className="text-sm">
          {configError ? `Connection error: ${configError}` : 'Loading BoostBooth Studio...'}
        </p>
        {configError && (
          <button
            type="button"
            onClick={loadKioskConfig}
            className="mt-4 min-h-[44px] px-5 py-2 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white font-semibold text-sm transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (step === 'welcome') {
    return (
      <WelcomePage
        settings={settings}
        activeFrameCount={frames.length}
        onStart={() => setStep('frames')}
        onOpenAdmin={() => navigate('/admin')}
        onOpenStation={() => navigate('/station')}
      />
    );
  }

  if (step === 'frames') {
    return (
      <FrameSelectionPage
        frames={frames}
        selectedFrameId={selectedFrame?.frame_id || null}
        onSelectFrame={(frame) => setSelectedFrame(frame)}
        onBack={() => setStep('welcome')}
        onContinue={() => {
          if (selectedFrame) {
            setCapturedPhotos([]);
            setGifBurstsBySlot([]);
            setStep('camera');
          }
        }}
      />
    );
  }

  if (step === 'camera' && selectedFrame) {
    return (
      <CameraPreviewPage
        settings={settings}
        selectedFrame={selectedFrame}
        onBackToFrames={() => setStep('frames')}
        onCaptureComplete={({ photos, gifBurstsBySlot: bursts }) => {
          setCapturedPhotos(photos);
          setGifBurstsBySlot(bursts);
          setStep('compose');
        }}
      />
    );
  }

  if (step === 'compose' && selectedFrame) {
    return (
      <PhotoComposerPage
        selectedFrame={selectedFrame}
        capturedPhotos={capturedPhotos}
        gifBurstsBySlot={gifBurstsBySlot}
        onContinue={() => setStep('generating')}
      />
    );
  }

  if (step === 'generating' && selectedFrame) {
    return (
      <GeneratingPage
        selectedFrame={selectedFrame}
        capturedPhotos={capturedPhotos}
        gifBurstsBySlot={gifBurstsBySlot}
        onComplete={(result) => {
          setCompletedResult(result);
          setStep('qr');
        }}
        onBackToPreview={() => setStep('compose')}
      />
    );
  }

  if (step === 'qr' && completedResult) {
    return (
      <QrDownloadPage
        settings={settings}
        session={completedResult.session}
        media={completedResult.media}
        onStartNewSession={resetKioskSession}
      />
    );
  }

  return (
    <WelcomePage
      settings={settings}
      activeFrameCount={frames.length}
      onStart={() => setStep('frames')}
      onOpenAdmin={() => navigate('/admin')}
      onOpenStation={() => navigate('/station')}
    />
  );
}
