import { Download, ExternalLink, RotateCcw, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { QrCodeCanvas } from '../../components/QrCodeCanvas';
import type { BoothSession, BoothSettings, MediaItem } from '../../types';

interface QrDownloadPageProps {
  settings: BoothSettings;
  session: BoothSession;
  media: MediaItem[];
  onStartNewSession: () => void;
}

export function QrDownloadPage({
  settings,
  session,
  media,
  onStartNewSession,
}: QrDownloadPageProps) {
  const autoResetSec = settings.auto_reset_seconds || 0;
  const [secondsLeft, setSecondsLeft] = useState<number>(autoResetSec || 60);

  useEffect(() => {
    if (!autoResetSec || autoResetSec <= 0) return;
    setSecondsLeft(autoResetSec);
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [autoResetSec]);

  useEffect(() => {
    if (autoResetSec > 0 && secondsLeft === 0) {
      onStartNewSession();
    }
  }, [autoResetSec, secondsLeft, onStartNewSession]);

  const framedPhoto = media.find((m) => m.media_type === 'framed') || media[0];
  const gifMedia = media.find((m) => m.media_type === 'gif');

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col justify-between p-6">
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between gap-4 border-b border-[#EFEAEC] pb-4">
        <span className="font-display text-lg font-semibold text-zinc-950">{settings.booth_name}</span>
        {autoResetSec > 0 && (
          <span className="font-mono text-xs text-zinc-500 tabular-nums">
            {secondsLeft}s
          </span>
        )}
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Photo + GIF Preview */}
        <div className="lg:col-span-6 flex flex-col gap-4 items-center">
          <div className="w-full max-w-md rounded-3xl bg-[#FBF9FA] border border-[#EFEAEC] p-4 shadow-sm space-y-3">
            {framedPhoto && (
              <img
                src={framedPhoto.public_url}
                alt="Framed Photo"
                className="w-full max-h-[46vh] object-contain rounded-2xl border border-[#EFEAEC] bg-white"
              />
            )}
            {gifMedia && (
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-[#EFEAEC]">
                <img
                  src={gifMedia.public_url}
                  alt="GIF"
                  className="w-20 h-20 object-cover rounded-xl border border-[#EFEAEC] shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#7A1C2C]">GIF</p>
                  <p className="text-xs text-zinc-500 truncate">{gifMedia.file_name}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: QR Code & Downloads */}
        <div className="lg:col-span-6 flex flex-col items-center lg:items-start text-center lg:text-left">
          <p className="text-sm font-semibold text-[#7A1C2C] uppercase tracking-[0.12em]">
            {settings.event_name}
          </p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold text-zinc-950 tracking-tight [text-wrap:balance]">
            SCAN TO DOWNLOAD
          </h1>

          <div className="mt-6 p-5 rounded-3xl bg-white border-2 border-[#7A1C2C]/20 text-zinc-950 inline-flex flex-col items-center shadow-lg">
            <QrCodeCanvas value={session.qr_url} size={230} />
            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-[#7A1C2C]">
              <Smartphone className="w-4 h-4" />
              <span>Scan with Camera</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-3 w-full">
            {framedPhoto && (
              <a
                href={`/api/download-file/${encodeURIComponent(framedPhoto.media_id)}`}
                download={framedPhoto.file_name}
                className="min-h-[48px] px-5 py-2.5 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-sm font-semibold text-zinc-900 hover:text-[#7A1C2C] inline-flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Photo</span>
              </a>
            )}

            {gifMedia && (
              <a
                href={`/api/download-file/${encodeURIComponent(gifMedia.media_id)}`}
                download={gifMedia.file_name}
                className="min-h-[48px] px-5 py-2.5 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-sm font-semibold text-zinc-900 hover:text-[#7A1C2C] inline-flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>GIF</span>
              </a>
            )}

            <a
              href={session.qr_url}
              target="_blank"
              rel="noreferrer"
              className="min-h-[48px] px-4 py-2.5 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-sm font-medium text-zinc-700 inline-flex items-center gap-2 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Link</span>
            </a>
          </div>

          <div className="mt-8 w-full max-w-md">
            <button
              type="button"
              onClick={onStartNewSession}
              className="w-full min-h-[60px] px-8 py-4 rounded-2xl bg-[#7A1C2C] hover:bg-[#611421] text-white font-display font-bold text-lg inline-flex items-center justify-center gap-3 transition-colors shadow-xl shadow-[#7A1C2C]/20"
            >
              <RotateCcw className="w-5 h-5" />
              <span>START NEW SESSION</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
