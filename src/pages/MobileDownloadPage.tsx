import { AlertTriangle, Clock, Download, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { kioskApi } from '../services/apiClient';
import type { BoothSession, MediaItem } from '../types';

interface MobileDownloadPageProps {
  token: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function MobileDownloadPage({ token }: MobileDownloadPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    session: BoothSession;
    media: MediaItem[];
    booth_name: string;
    event_name: string;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    kioskApi
      .getDownloadBundle(token)
      .then((res) => setData(res))
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load session.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleNativeShare = async (item: MediaItem) => {
    if (!navigator.share) return;
    try {
      const response = await fetch(item.public_url);
      const blob = await response.blob();
      const file = new File([blob], item.file_name, { type: item.mime_type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: data?.event_name || 'BoostBooth',
        });
      } else {
        await navigator.share({
          title: data?.event_name || 'BoostBooth',
          url: window.location.href,
        });
      }
    } catch {
      // user cancelled
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-zinc-900 flex items-center justify-center p-6">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-white text-zinc-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl bg-[#FBF9FA] border border-[#EFEAEC] p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-[#7A1C2C] mx-auto" />
          <h1 className="mt-4 font-display text-xl font-bold text-zinc-950">Link Unavailable</h1>
          <p className="mt-2 text-sm text-zinc-600">{error || 'Session not found.'}</p>
        </div>
      </div>
    );
  }

  const sortedMedia = data
    ? [...data.media].sort((a, b) => {
        const order = (m: MediaItem) =>
          m.media_type === 'framed' ? 0 : m.media_type === 'gif' ? 1 : 2;
        const diff = order(a) - order(b);
        if (diff !== 0) return diff;
        return a.file_name.localeCompare(b.file_name, undefined, { numeric: true });
      })
    : [];

  const handleShareAll = async () => {
    if (!navigator.share || sortedMedia.length === 0) return;
    try {
      const files = await Promise.all(
        sortedMedia.map(async (item) => {
          const response = await fetch(`/api/download-file/${encodeURIComponent(item.media_id)}`);
          const blob = await response.blob();
          return new File([blob], item.file_name, {
            type: item.mime_type || blob.type || 'image/jpeg',
          });
        })
      );
      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({
          files,
          title: data.event_name || 'BoostBooth',
        });
      }
    } catch {
      // user cancelled
    }
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 pb-12">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-[#EFEAEC] px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-[#7A1C2C] font-semibold uppercase tracking-wider">
              {data.event_name}
            </p>
            <h1 className="font-display text-lg font-bold text-zinc-950">{data.booth_name}</h1>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Clock className="w-3.5 h-3.5" />
            <span>{new Date(data.session.expires_at).toLocaleDateString()}</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 pt-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold text-zinc-950">Your Gallery</h2>
          {typeof navigator !== 'undefined' && 'share' in navigator && sortedMedia.length > 1 && (
            <button
              type="button"
              onClick={handleShareAll}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              <span>Share All ({sortedMedia.length})</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {sortedMedia.map((item) => (
            <article
              key={item.media_id}
              className="rounded-2xl bg-[#FBF9FA] border border-[#EFEAEC] overflow-hidden flex flex-col shadow-sm"
            >
              <div className="bg-zinc-100 flex items-center justify-center p-3 min-h-[240px]">
                <img
                  src={item.public_url}
                  alt={item.file_name}
                  className="w-full max-h-[380px] object-contain rounded-xl"
                />
              </div>

              <div className="p-4 flex flex-col gap-3 bg-white border-t border-[#EFEAEC]">
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-semibold text-[#7A1C2C] uppercase tracking-wide">
                    {item.media_type === 'original' ? 'Original Raw' : item.media_type}
                  </span>
                  <span className="font-mono tabular-nums">{formatSize(item.file_size)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={item.drive_download_url || `/api/download-file/${encodeURIComponent(item.media_id)}`}
                    download={item.file_name}
                    target={item.drive_download_url ? '_blank' : undefined}
                    rel="noreferrer"
                    className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white font-display font-bold text-sm inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </a>

                  {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <button
                      type="button"
                      onClick={() => handleNativeShare(item)}
                      className="min-h-[48px] min-w-[48px] px-3 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-[#7A1C2C] inline-flex items-center justify-center"
                      aria-label="Share or save to photos"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
