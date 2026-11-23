import {
  Camera,
  Check,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  MessageCircle,
  QrCode,
  RefreshCw,
  Search,
  Share2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { QrCodeCanvas } from '../components/QrCodeCanvas';
import { adminApi } from '../services/apiClient';
import type { BoothSession, MediaItem } from '../types';

type StationSession = BoothSession & { media: MediaItem[] };

interface StaffStationPageProps {
  onOpenKiosk: () => void;
  onOpenAdmin: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function StaffStationPage({ onOpenKiosk, onOpenAdmin }: StaffStationPageProps) {
  const [sessions, setSessions] = useState<StationSession[]>([]);
  const [boothName, setBoothName] = useState('BoostBooth Studio');
  const [eventName, setEventName] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrModalSession, setQrModalSession] = useState<StationSession | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fetchFeed = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await adminApi.getStationFeed();
      setBoothName(res.booth_name);
      setEventName(res.event_name);
      setSessions(res.sessions);
      setSelectedSessionId((prev) => {
        if (prev && res.sessions.some((s) => s.session_id === prev)) return prev;
        return res.sessions[0]?.session_id || null;
      });
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Unable to sync station feed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeed(false);
  }, [fetchFeed]);

  // Parallel auto-polling every 4 seconds so new Kiosk shoots appear immediately
  useEffect(() => {
    if (!autoSync) return;
    const timer = window.setInterval(() => {
      fetchFeed(true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [autoSync, fetchFeed]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.session_id.toLowerCase().includes(q) ||
        (s.selected_frame_name || '').toLowerCase().includes(q)
    );
  }, [sessions, search]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.session_id === selectedSessionId) || filteredSessions[0] || null,
    [sessions, selectedSessionId, filteredSessions]
  );

  // Native AirDrop / iOS-macOS Share Sheet for single or multiple files (including Raw Original photos)
  const handleAirDropShare = async (items: MediaItem[], labelKey: string) => {
    if (items.length === 0) return;
    setSharingId(labelKey);
    setStatusMessage(null);
    try {
      const files = await Promise.all(
        items.map(async (item) => {
          const resp = await fetch(`/api/download-file/${encodeURIComponent(item.media_id)}`);
          if (!resp.ok) {
            throw new Error(`ไม่สามารถโหลดไฟล์ ${item.file_name} ได้`);
          }
          const blob = await resp.blob();
          const mime =
            item.mime_type ||
            blob.type ||
            (item.media_type === 'gif' ? 'image/gif' : 'image/jpeg');
          return new File([blob], item.file_name, { type: mime });
        })
      );

      if (navigator.share && navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({
          files,
          title: `${eventName || boothName} — ${items[0].session_id}`,
        });
      } else if (navigator.share) {
        setStatusMessage(
          'เบราว์เซอร์ไม่รองรับการส่งหลายไฟล์พร้อมกันผ่าน Share Sheet — กำลังแชร์เป็นลิงก์แทน (แนะนำใช้ Safari บน Mac/iPad หรือกดโหลดไฟล์ทีละรายการ)'
        );
        await navigator.share({
          title: `${eventName || boothName}`,
          url: activeSession?.qr_url || window.location.href,
        });
      } else {
        setStatusMessage(
          'เบราว์เซอร์นี้ไม่รองรับ AirDrop Share Sheet โดยตรง — แนะนำเปิดหน้านี้บน Safari (Mac/iPad) หรือลากรูปเข้าหน้าต่าง AirDrop ได้เลย'
        );
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setStatusMessage(
        err instanceof Error ? err.message : 'ไม่สามารถเปิดหน้าต่างแชร์ไฟล์ได้'
      );
    } finally {
      setSharingId(null);
    }
  };

  const handleLineShare = (session: StationSession) => {
    const text = `ภาพถ่ายและ GIF จาก ${eventName || boothName} พร้อมดาวน์โหลดแล้ว: ${session.qr_url}`;
    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
    window.open(lineUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyUrl = async (url: string, key: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Enables dragging images straight from Chrome/Safari onto macOS Finder / Desktop / AirDrop
  const handleDragStart = (e: React.DragEvent<HTMLElement>, item: MediaItem) => {
    const absDownloadUrl = `${window.location.origin}/api/download-file/${encodeURIComponent(item.media_id)}`;
    const mime = item.mime_type || (item.media_type === 'gif' ? 'image/gif' : 'image/jpeg');
    e.dataTransfer.setData('DownloadURL', `${mime}:${item.file_name}:${absDownloadUrl}`);
    e.dataTransfer.setData('text/uri-list', absDownloadUrl);
    e.dataTransfer.setData('text/plain', absDownloadUrl);
  };

  const sortedSessionMedia = useMemo(() => {
    if (!activeSession) return [];
    const order = (m: MediaItem) =>
      m.media_type === 'framed' ? 0 : m.media_type === 'gif' ? 1 : 2;
    return [...activeSession.media].sort((a, b) => {
      const diff = order(a) - order(b);
      if (diff !== 0) return diff;
      return a.file_name.localeCompare(b.file_name, undefined, { numeric: true });
    });
  }, [activeSession]);

  return (
    <div className="min-h-screen bg-[#FBF9FA] text-zinc-900 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-[#EFEAEC] px-6 py-4 flex flex-wrap items-center justify-between gap-4 bg-white">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-[#7A1C2C] text-white flex items-center justify-center font-display font-bold text-lg">
            B
          </div>
          <div>
            <h1 className="font-display text-lg font-bold text-zinc-950">
              {boothName} · Parallel AirDrop &amp; File Station
            </h1>
            <p className="text-xs text-zinc-500">
              หน้าจอสำหรับเจ้าหน้าที่ (เปิดคู่ขนานระหว่างหน้าตู้ถ่ายรูปกำลังทำงาน)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoSync((v) => !v)}
            className={`min-h-[40px] px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
              autoSync
                ? 'bg-[#FDF2F4] border-[#EAD5DA] text-[#7A1C2C]'
                : 'bg-zinc-50 border-zinc-200 text-zinc-600'
            }`}
          >
            {autoSync ? 'Live Sync: ON (4s)' : 'Live Sync: Paused'}
          </button>

          <button
            type="button"
            onClick={() => fetchFeed(false)}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-xs font-medium text-zinc-700 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={onOpenAdmin}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-xs font-medium text-zinc-700"
          >
            Admin
          </button>

          <button
            type="button"
            onClick={onOpenKiosk}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Kiosk View</span>
          </button>
        </div>
      </header>

      {statusMessage && (
        <div className="bg-[#FDF2F4] border-b border-[#EAD5DA] px-6 py-2.5 text-xs text-[#5E1421] flex items-center justify-between gap-3">
          <span>{statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Parallel Split Workspace: Left Folders / Right AirDrop & LINE Actions */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0">
        {/* Left: Session Folder List */}
        <aside className="lg:col-span-4 xl:col-span-3 border-b lg:border-b-0 lg:border-r border-[#EFEAEC] bg-[#FBF9FA] flex flex-col">
          <div className="p-4 border-b border-[#EFEAEC] bg-white">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหา Session ID หรือกรอบ..."
                className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-[#E5DADF] bg-[#FBF9FA] text-sm focus:outline-none focus:ring-2 focus:ring-[#7A1C2C]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#EFEAEC] max-h-[40vh] lg:max-h-[calc(100vh-140px)]">
            {filteredSessions.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                ยังไม่มีเซสชันที่ถ่ายเสร็จ เมื่อลูกค้าถ่ายบนหน้าจอบูธ รายการจะเด้งขึ้นมาที่นี่ทันที
              </div>
            ) : (
              filteredSessions.map((s) => {
                const isSelected = activeSession?.session_id === s.session_id;
                const thumb =
                  s.media.find((m) => m.media_type === 'framed') ||
                  s.media.find((m) => m.media_type === 'gif') ||
                  s.media[0];
                return (
                  <button
                    key={s.session_id}
                    type="button"
                    onClick={() => setSelectedSessionId(s.session_id)}
                    className={`w-full text-left p-3.5 flex items-center gap-3 transition-colors ${
                      isSelected ? 'bg-[#FDF2F4] border-r-2 border-[#7A1C2C]' : 'bg-white hover:bg-[#FBF9FA]'
                    }`}
                  >
                    <div className="w-12 h-14 rounded-lg border border-zinc-200 bg-zinc-100 overflow-hidden shrink-0 flex items-center justify-center">
                      {thumb ? (
                        <img
                          src={thumb.public_url}
                          alt={s.session_id}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FolderOpen className="w-5 h-5 text-zinc-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-bold text-zinc-900 truncate">
                        {s.session_id}
                      </p>
                      <p className="text-xs text-zinc-600 truncate mt-0.5">
                        {s.selected_frame_name || s.selected_frame_id}
                      </p>
                      <p className="text-[11px] text-zinc-400 mt-0.5 tabular-nums">
                        {new Date(s.created_at).toLocaleTimeString()} · {s.media.length} ไฟล์
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: Active Session Folder Contents */}
        <main className="lg:col-span-8 xl:col-span-9 p-6 overflow-y-auto bg-white">
          {!activeSession ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-20 border border-dashed border-zinc-300 rounded-2xl bg-zinc-50">
              <FolderOpen className="w-10 h-10 text-zinc-400" />
              <p className="mt-3 font-display text-lg font-semibold text-zinc-800">
                เลือกโฟลเดอร์เซสชันทางซ้าย
              </p>
              <p className="mt-1 text-sm text-zinc-500 max-w-md">
                เมื่อแขกถ่ายรูปบนจอบูธเสร็จ โฟลเดอร์รูป + GIF 3 วินาที จะมาปรากฏให้กด AirDrop, ลากไฟล์, หรือส่ง LINE ทันที
              </p>
            </div>
          ) : (
            <div className="space-y-6 max-w-5xl">
              {/* Folder Action Header */}
              <div className="rounded-2xl bg-[#FBF9FA] border border-[#EFEAEC] p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-[#7A1C2C]" />
                    <h2 className="font-mono text-lg font-bold text-zinc-950">
                      {activeSession.session_id}
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {activeSession.selected_frame_name || activeSession.selected_frame_id} ·{' '}
                    {new Date(activeSession.created_at).toLocaleString()} · ลากรูปไปวางที่ Desktop/Finder หรือกด AirDrop ได้ทันที
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {sortedSessionMedia.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleAirDropShare(sortedSessionMedia, 'all')}
                      disabled={sharingId === 'all'}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white font-semibold text-xs inline-flex items-center gap-2 shadow-sm disabled:opacity-50 transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>
                        {sharingId === 'all'
                          ? 'Preparing...'
                          : `AirDrop / Share ทั้งหมด (${sortedSessionMedia.length} ไฟล์)`}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleLineShare(activeSession)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#06C755] hover:bg-[#05b34c] text-white font-semibold text-xs inline-flex items-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>ส่งเข้า LINE</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQrModalSession(activeSession)}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-800 inline-flex items-center gap-1.5"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>แสดง QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyUrl(activeSession.qr_url, activeSession.session_id)}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-medium text-zinc-700 inline-flex items-center gap-1.5"
                  >
                    {copiedId === activeSession.session_id ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>{copiedId === activeSession.session_id ? 'Copied' : 'Copy Link'}</span>
                  </button>
                </div>
              </div>

              {/* Files Grid */}
              {sortedSessionMedia.length === 0 ? (
                <div className="p-10 text-center rounded-2xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
                  เซสชันนี้กำลังประมวลผลหรือยังไม่มีไฟล์อัปโหลด...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {sortedSessionMedia.map((item) => (
                    <article
                      key={item.media_id}
                      className="rounded-2xl border border-zinc-200 bg-zinc-50 overflow-hidden flex flex-col shadow-sm"
                    >
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, item)}
                        className="p-3 bg-zinc-100 flex items-center justify-center min-h-[240px] cursor-grab active:cursor-grabbing"
                        title="ลากไฟล์เพื่อวางลง Mac Finder / AirDrop"
                      >
                        <img
                          src={item.public_url}
                          alt={item.file_name}
                          draggable
                          onDragStart={(e) => handleDragStart(e, item)}
                          className="max-h-[300px] w-full object-contain rounded-xl"
                        />
                      </div>

                      <div className="p-4 bg-white border-t border-zinc-200 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold uppercase text-zinc-900">
                            {item.media_type === 'gif'
                              ? '3s Boomerang GIF'
                              : item.media_type === 'framed'
                                ? 'Framed Photo'
                                : 'Original Raw'}
                          </span>
                          <span className="font-mono text-zinc-500 tabular-nums">
                            {formatBytes(item.file_size)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAirDropShare([item], item.media_id)}
                            disabled={sharingId === item.media_id}
                            className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>
                              {sharingId === item.media_id ? 'Loading...' : 'AirDrop / Share'}
                            </span>
                          </button>

                          <a
                            href={`/api/download-file/${encodeURIComponent(item.media_id)}`}
                            download={item.file_name}
                            className="min-h-[42px] px-3 py-2 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-[#7A1C2C] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>โหลดไฟล์</span>
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Quick QR Modal */}
      {qrModalSession && (
        <div
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 border border-[#EFEAEC] shadow-2xl text-center">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-base font-bold text-zinc-900">
                {qrModalSession.session_id}
              </h3>
              <button
                type="button"
                onClick={() => setQrModalSession(null)}
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-center">
              <QrCodeCanvas value={qrModalSession.qr_url} size={220} />
            </div>
            <p className="mt-3 text-xs font-mono text-zinc-500 break-all">
              {qrModalSession.qr_url}
            </p>
            <a
              href={qrModalSession.qr_url}
              target="_blank"
              rel="noreferrer"
              className="mt-5 w-full min-h-[44px] rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Mobile Download Page</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
