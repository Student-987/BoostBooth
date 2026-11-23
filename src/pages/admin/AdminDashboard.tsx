import {
  Activity,
  Camera,
  CheckCircle2,
  Code2,
  ExternalLink,
  FileImage,
  FolderOpen,
  HardDrive,
  ImagePlus,
  LayoutGrid,
  LogOut,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  Share2,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmModal } from '../../components/ConfirmModal';
import { QrCodeCanvas } from '../../components/QrCodeCanvas';
import { FrameLayoutEditorModal } from '../../components/admin/FrameLayoutEditorModal';
import { GasExportToolkit } from '../../components/admin/GasExportToolkit';
import { adminApi, setAdminToken } from '../../services/apiClient';
import { readFileAsDataUrl } from '../../services/composer';
import { listCameraAdapters } from '../../services/camera/cameraManager';
import type {
  BoothSession,
  BoothSettings,
  CameraAdapterId,
  CanvaFrame,
  DashboardStats,
  DrivePrivacyMode,
  MediaItem,
  SystemLog,
} from '../../types';

type AdminTab = 'dashboard' | 'frames' | 'sessions' | 'files' | 'settings' | 'logs' | 'gas';

interface AdminDashboardProps {
  onExitToKiosk: () => void;
  onOpenStation?: () => void;
  onSettingsChanged: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function AdminDashboard({
  onExitToKiosk,
  onOpenStation,
  onSettingsChanged,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [settings, setSettings] = useState<BoothSettings | null>(null);
  const [frames, setFrames] = useState<CanvaFrame[]>([]);
  const [sessions, setSessions] = useState<BoothSession[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);

  // Frame Editor State
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFrame, setEditingFrame] = useState<CanvaFrame | null>(null);
  const [savingFrame, setSavingFrame] = useState(false);

  // Filters & Search
  const [sessionSearch, setSessionSearch] = useState('');
  const [logFilter, setLogFilter] = useState<'all' | 'error' | 'warning' | 'success'>('all');

  // QR Session Inspector Modal
  const [inspectSession, setInspectSession] = useState<BoothSession | null>(null);

  // Confirmation Modal State
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Settings Form State
  const [gasUrlInput, setGasUrlInput] = useState('');
  const [gasSecretInput, setGasSecretInput] = useState('');
  const [gasBusy, setGasBusy] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploadingAssetKey, setUploadingAssetKey] = useState<string | null>(null);
  const [networkInfo, setNetworkInfo] = useState<{
    gas_connected: boolean;
    public_qr_base_url: string;
    shared_preview_url: string;
    lan_urls: string[];
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [data, net] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.getNetworkInfo().catch(() => null),
      ]);
      setStats(data.stats);
      setSettings(data.settings);
      setFrames(data.frames);
      setSessions(data.sessions);
      setMedia(data.media);
      setLogs(data.logs);
      if (net) setNetworkInfo(net);
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load dashboard.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUploadWelcomeAsset = async (
    target: 'logo' | 'bg' | 'hero0' | 'hero1' | 'hero2',
    file: File | null
  ) => {
    if (!file || !settings) return;
    setUploadingAssetKey(target);
    setBanner(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await adminApi.uploadAsset(file.name, dataUrl);
      if (target === 'logo') {
        setSettings({ ...settings, logo_url: res.url });
      } else if (target === 'bg') {
        setSettings({ ...settings, welcome_bg_url: res.url });
      } else {
        const idx = target === 'hero0' ? 0 : target === 'hero1' ? 1 : 2;
        const nextHeroes = [...(settings.welcome_hero_images || ['', '', ''])];
        nextHeroes[idx] = res.url;
        setSettings({ ...settings, welcome_hero_images: nextHeroes });
      }
      setBanner({
        type: 'success',
        text: 'อัปโหลดภาพตกแต่งเรียบร้อยแล้ว (กด Save Settings ด้านล่างเพื่อยืนยันบนหน้าจอ Kiosk)',
      });
    } catch (err) {
      setBanner({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload image asset.',
      });
    } finally {
      setUploadingAssetKey(null);
    }
  };

  const handleSaveFrame = async (payload: Partial<CanvaFrame> & { pngDataUrl?: string }) => {
    setSavingFrame(true);
    try {
      await adminApi.saveFrame(payload);
      setEditorOpen(false);
      setBanner({ type: 'success', text: 'Canva frame saved successfully.' });
      await loadData();
      onSettingsChanged();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSavingFrame(false);
    }
  };

  const handleToggleFrame = async (frame: CanvaFrame) => {
    try {
      await adminApi.toggleFrame(frame.frame_id, !frame.is_active);
      await loadData();
      onSettingsChanged();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Toggle failed.' });
    }
  };

  const requestDeleteFrame = (frame: CanvaFrame) => {
    setConfirmState({
      open: true,
      title: `Delete "${frame.frame_name}"?`,
      description:
        'This removes the Canva frame from BoostBooth and trashes its Drive file if synced. Existing session photos will remain untouched.',
      confirmLabel: 'Delete Frame',
      onConfirm: async () => {
        await adminApi.deleteFrame(frame.frame_id);
        setBanner({ type: 'success', text: `Deleted frame ${frame.frame_name}.` });
        await loadData();
        onSettingsChanged();
      },
    });
  };

  const requestDeleteMedia = (item: MediaItem) => {
    setConfirmState({
      open: true,
      title: `Delete "${item.file_name}"?`,
      description:
        'This permanently deletes the media file from local storage and moves the Google Drive copy to trash.',
      confirmLabel: 'Delete File',
      onConfirm: async () => {
        await adminApi.deleteMediaFile(item.media_id);
        setBanner({ type: 'success', text: `Deleted ${item.file_name}.` });
        await loadData();
      },
    });
  };

  const requestPurgeExpired = () => {
    setConfirmState({
      open: true,
      title: 'Purge Expired Files?',
      description: `This will permanently remove ${stats?.expired_files || 0} expired session file(s) from storage and Google Drive.`,
      confirmLabel: 'Purge Expired',
      onConfirm: async () => {
        const res = await adminApi.purgeExpiredFiles();
        setBanner({ type: 'success', text: `Purged ${res.deletedCount} expired file(s).` });
        await loadData();
      },
    });
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    setBanner(null);
    try {
      await adminApi.updateSettings({
        ...settings,
        ...(gasUrlInput.trim() ? { gas_web_app_url: gasUrlInput.trim() } : {}),
        ...(gasSecretInput.trim() ? { gas_api_secret: gasSecretInput.trim() } : {}),
      });
      setGasUrlInput('');
      setGasSecretInput('');
      setBanner({ type: 'success', text: 'System settings saved.' });
      await loadData();
      onSettingsChanged();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'Save settings failed.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestAndInitGas = async () => {
    setGasBusy(true);
    setBanner(null);
    try {
      const res = await adminApi.testAndInitGas({
        gas_web_app_url: gasUrlInput.trim() || undefined,
        gas_api_secret: gasSecretInput.trim() || undefined,
        drive_folder_id: settings?.drive_folder_id?.trim() || undefined,
      });
      setGasUrlInput('');
      setGasSecretInput('');
      setBanner({
        type: 'success',
        text: `${res.message} Sheet ID: ${res.spreadsheet_id || 'Linked'}`,
      });
      await loadData();
    } catch (err) {
      setBanner({ type: 'error', text: err instanceof Error ? err.message : 'GAS sync failed.' });
    } finally {
      setGasBusy(false);
    }
  };

  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.session_id.toLowerCase().includes(q) ||
        (s.selected_frame_name || '').toLowerCase().includes(q) ||
        s.shooting_mode.toLowerCase().includes(q)
    );
  }, [sessions, sessionSearch]);

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return logs;
    return logs.filter((l) => l.status === logFilter);
  }, [logs, logFilter]);

  const navItems: Array<{ id: AdminTab; label: string; icon: typeof LayoutGrid }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'frames', label: 'Frame Manager', icon: FileImage },
    { id: 'sessions', label: 'Session Manager', icon: QrCode },
    { id: 'files', label: 'File Manager', icon: FolderOpen },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'logs', label: 'System Logs', icon: Activity },
    { id: 'gas', label: 'GAS & Bridge Setup', icon: Code2 },
  ];

  return (
    <div className="min-h-screen bg-[#FBF9FA] text-zinc-900 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-[#EFEAEC] flex flex-col justify-between shrink-0">
        <div>
          <div className="px-6 py-5 border-b border-[#EFEAEC] flex items-center justify-between">
            <div>
              <p className="font-display text-lg font-bold text-[#7A1C2C]">BoostBooth</p>
              <p className="text-xs text-zinc-500">Admin Console</p>
            </div>
          </div>

          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`min-h-[42px] px-3.5 py-2 rounded-xl text-sm font-medium inline-flex items-center gap-2.5 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#7A1C2C] text-white shadow-sm'
                      : 'text-zinc-600 hover:bg-[#FDF2F4] hover:text-[#7A1C2C]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-[#EFEAEC] space-y-2">
          {onOpenStation && (
            <button
              type="button"
              onClick={onOpenStation}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Staff AirDrop Station</span>
            </button>
          )}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onExitToKiosk}
              className="flex-1 min-h-[42px] px-3 py-2 rounded-xl border border-[#E5DADF] hover:bg-[#FDF2F4] text-xs font-semibold text-[#7A1C2C] inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Open Kiosk</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAdminToken(null);
                onExitToKiosk();
              }}
              className="min-h-[42px] min-w-[42px] rounded-xl border border-[#E5DADF] hover:bg-red-50 hover:text-red-600 text-zinc-500 inline-flex items-center justify-center"
              title="Lock & Sign Out"
              aria-label="Lock and sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-[#EFEAEC] px-6 py-4 flex items-center justify-between gap-4">
          <h1 className="font-display text-xl font-bold text-zinc-900 capitalize">
            {navItems.find((n) => n.id === activeTab)?.label}
          </h1>

          <div className="flex items-center gap-3">
            {onOpenStation && (
              <button
                type="button"
                onClick={onOpenStation}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#FDF2F4] border border-[#EAD5DA] hover:bg-[#F9E4E8] text-xs font-semibold text-[#7A1C2C] inline-flex items-center gap-1.5 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Open AirDrop Station (/station)</span>
              </button>
            )}
            <span className="text-xs text-zinc-500 hidden md:inline">
              {stats?.gas_connected ? 'GAS Sync Connected' : 'Local Workspace Mode'}
            </span>
            <button
              type="button"
              onClick={loadData}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-xs font-medium text-zinc-700 inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {banner && (
            <div
              className={`rounded-xl px-4 py-3 text-sm border flex items-center justify-between gap-3 ${
                banner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-900'
              }`}
            >
              <span>{banner.text}</span>
              <button type="button" onClick={() => setBanner(null)} className="p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && stats && (
            <div className="space-y-6">
              {!stats.gas_connected && (
                <div className="rounded-xl bg-[#FDF2F4] border border-[#EAD5DA] p-4 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#5E1421]">
                      Google Apps Script Backend Not Connected Yet
                    </p>
                    <p className="text-xs text-[#7A1C2C]/80 mt-0.5">
                      Sessions and photos are safely persisted locally. Connect your GAS Web App URL in Settings to sync directly to Google Sheets & Google Drive.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('gas')}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white text-xs font-semibold whitespace-nowrap transition-colors"
                  >
                    Open GAS Setup
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl bg-white border border-zinc-200 p-5">
                  <p className="text-xs text-zinc-500">Total Sessions</p>
                  <p className="mt-2 font-display text-3xl font-bold tabular-nums text-zinc-900">
                    {stats.total_sessions}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">{stats.active_frames} active frames</p>
                </div>
                <div className="rounded-xl bg-white border border-zinc-200 p-5">
                  <p className="text-xs text-zinc-500">Captured Photos</p>
                  <p className="mt-2 font-display text-3xl font-bold tabular-nums text-zinc-900">
                    {stats.total_photos}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">Original + Framed</p>
                </div>
                <div className="rounded-xl bg-white border border-zinc-200 p-5">
                  <p className="text-xs text-zinc-500">3s Boomerang GIFs</p>
                  <p className="mt-2 font-display text-3xl font-bold tabular-nums text-zinc-900">
                    {stats.total_gifs}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Captured during final 3s countdown
                  </p>
                </div>
                <div className="rounded-xl bg-white border border-zinc-200 p-5">
                  <p className="text-xs text-zinc-500">Storage Used</p>
                  <p className="mt-2 font-display text-3xl font-bold tabular-nums text-zinc-900">
                    {formatBytes(stats.storage_used_bytes)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">{stats.expired_files} expired files</p>
                </div>
              </div>

              {/* Recent Sessions */}
              <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
                  <h2 className="font-semibold text-sm text-zinc-900">Recent Sessions</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sessions')}
                    className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                  >
                    View all
                  </button>
                </div>
                {sessions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-zinc-500">
                    No photo booth sessions recorded yet. Open the Kiosk to run a session.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-zinc-50 text-xs text-zinc-500 border-b border-zinc-200">
                        <tr>
                          <th className="px-5 py-3 font-medium">Session ID</th>
                          <th className="px-5 py-3 font-medium">Frame</th>
                          <th className="px-5 py-3 font-medium">Mode</th>
                          <th className="px-5 py-3 font-medium">Status</th>
                          <th className="px-5 py-3 font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {sessions.slice(0, 6).map((s) => (
                          <tr key={s.session_id} className="hover:bg-zinc-50">
                            <td className="px-5 py-3 font-mono text-xs text-zinc-900">{s.session_id}</td>
                            <td className="px-5 py-3 text-zinc-700">{s.selected_frame_name || s.selected_frame_id}</td>
                            <td className="px-5 py-3 uppercase text-xs font-medium text-zinc-600">{s.shooting_mode}</td>
                            <td className="px-5 py-3 text-xs font-medium text-zinc-700">{s.session_status}</td>
                            <td className="px-5 py-3 font-mono text-xs text-zinc-500 tabular-nums">
                              {new Date(s.created_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: FRAME MANAGER */}
          {activeTab === 'frames' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-zinc-600">
                  Upload transparent PNGs exported from Canva and position percentage photo slots visually.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingFrame(null);
                    setEditorOpen(true);
                  }}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Canva Frame</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {frames.map((frame) => (
                  <div
                    key={frame.frame_id}
                    className="rounded-xl bg-white border border-zinc-200 p-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="aspect-[4/5] rounded-lg checkerboard-bg border border-zinc-200 p-3 flex items-center justify-center overflow-hidden">
                        <img
                          src={frame.preview_url}
                          alt={frame.frame_name}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="mt-3 flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold text-zinc-900">{frame.frame_name}</h3>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {frame.category} · {frame.frame_layout.length} slot(s) · {frame.width}×{frame.height}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleToggleFrame(frame)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                            frame.is_active
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-zinc-100 border-zinc-200 text-zinc-600'
                          }`}
                        >
                          {frame.is_active ? 'Active' : 'Disabled'}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFrame(frame);
                          setEditorOpen(true);
                        }}
                        className="flex-1 min-h-[38px] rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs font-semibold text-zinc-800"
                      >
                        Edit Layout
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDeleteFrame(frame)}
                        className="min-h-[38px] min-w-[38px] rounded-lg border border-zinc-200 hover:bg-red-50 text-red-600 inline-flex items-center justify-center"
                        aria-label="Delete frame"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: SESSION MANAGER */}
          {activeTab === 'sessions' && (
            <div className="space-y-4">
              <div className="relative max-w-sm">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  placeholder="Search session ID, frame, or mode..."
                  className="w-full min-h-[42px] pl-10 pr-4 rounded-xl border border-zinc-200 bg-white text-sm"
                />
              </div>

              <div className="rounded-xl bg-white border border-zinc-200 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs text-zinc-500 border-b border-zinc-200">
                    <tr>
                      <th className="px-5 py-3 font-medium">Session ID</th>
                      <th className="px-5 py-3 font-medium">Frame</th>
                      <th className="px-5 py-3 font-medium">Mode</th>
                      <th className="px-5 py-3 font-medium">Files</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Expires</th>
                      <th className="px-5 py-3 font-medium text-right">QR & Download</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredSessions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-10 text-center text-zinc-500">
                          No matching sessions found.
                        </td>
                      </tr>
                    ) : (
                      filteredSessions.map((s) => (
                        <tr key={s.session_id} className="hover:bg-zinc-50">
                          <td className="px-5 py-3 font-mono text-xs text-zinc-900">{s.session_id}</td>
                          <td className="px-5 py-3 text-zinc-700">{s.selected_frame_name || s.selected_frame_id}</td>
                          <td className="px-5 py-3 uppercase text-xs font-medium text-zinc-600">{s.shooting_mode}</td>
                          <td className="px-5 py-3 font-mono text-xs tabular-nums">{s.media_count ?? 0}</td>
                          <td className="px-5 py-3 text-xs font-medium text-zinc-700">{s.session_status}</td>
                          <td className="px-5 py-3 font-mono text-xs text-zinc-500 tabular-nums">
                            {new Date(s.expires_at).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => setInspectSession(s)}
                              className="min-h-[34px] px-3 py-1 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-xs font-medium text-zinc-800 inline-flex items-center gap-1.5"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: FILE MANAGER */}
          {activeTab === 'files' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-zinc-600">
                  Manage captured photos and 3s Boomerang GIFs stored locally and synced to Google Drive.
                </p>
                <button
                  type="button"
                  onClick={requestPurgeExpired}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold inline-flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Purge Expired Files ({stats?.expired_files ?? 0})</span>
                </button>
              </div>

              <div className="rounded-xl bg-white border border-zinc-200 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs text-zinc-500 border-b border-zinc-200">
                    <tr>
                      <th className="px-5 py-3 font-medium">File Name</th>
                      <th className="px-5 py-3 font-medium">Session</th>
                      <th className="px-5 py-3 font-medium">Type</th>
                      <th className="px-5 py-3 font-medium">Size</th>
                      <th className="px-5 py-3 font-medium">Sync</th>
                      <th className="px-5 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {media.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-zinc-500">
                          No uploaded media files yet.
                        </td>
                      </tr>
                    ) : (
                      media.map((m) => (
                        <tr key={m.media_id} className="hover:bg-zinc-50">
                          <td className="px-5 py-3 font-mono text-xs text-zinc-900">{m.file_name}</td>
                          <td className="px-5 py-3 font-mono text-xs text-zinc-600">{m.session_id}</td>
                          <td className="px-5 py-3 uppercase text-xs font-medium text-zinc-700">{m.media_type}</td>
                          <td className="px-5 py-3 font-mono text-xs tabular-nums text-zinc-600">
                            {formatBytes(m.file_size)}
                          </td>
                          <td className="px-5 py-3 text-xs text-zinc-600">{m.upload_status}</td>
                          <td className="px-5 py-3 text-right space-x-2">
                            <a
                              href={m.public_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-zinc-950"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>View</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => requestDeleteMedia(m)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 ml-3"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: SETTINGS */}
          {activeTab === 'settings' && settings && (
            <div className="space-y-6 max-w-4xl">
              {/* GAS & Google Drive Sync Card */}
              <section className="rounded-xl bg-white border border-zinc-200 p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-lg font-bold text-zinc-900 flex items-center gap-2">
                      <HardDrive className="w-5 h-5" />
                      <span>Google Apps Script & Drive Connection</span>
                    </h2>
                    <p className="text-xs text-zinc-500 mt-1">
                      Connect your deployed GAS Web App URL to sync SETTINGS, FRAMES, SESSIONS, MEDIA, LOGS to Google Sheets and store files in Google Drive.
                    </p>
                  </div>
                  {settings.gas_web_app_url_configured && (
                    <span className="text-xs font-semibold text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Configured</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      GAS Web App URL (https://script.google.com/macros/s/.../exec)
                    </label>
                    <input
                      type="url"
                      value={gasUrlInput}
                      onChange={(e) => setGasUrlInput(e.target.value)}
                      placeholder={
                        settings.gas_web_app_url_configured
                          ? 'Configured on server (enter new URL to update)'
                          : 'https://script.google.com/macros/s/.../exec'
                      }
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      GAS API Secret (Script Property: GAS_API_SECRET)
                    </label>
                    <input
                      type="password"
                      value={gasSecretInput}
                      onChange={(e) => setGasSecretInput(e.target.value)}
                      placeholder="Optional shared secret"
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-xs font-mono"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-medium text-zinc-700">
                        Google Drive Target Folder ID / URL (โฟลเดอร์ปลายทางสำหรับเก็บรูปใน Google Drive)
                      </label>
                      {settings.drive_folder_id && (
                        <a
                          href={`https://drive.google.com/drive/folders/${encodeURIComponent(
                            settings.drive_folder_id.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] ||
                              settings.drive_folder_id
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-[#7A1C2C] hover:underline inline-flex items-center gap-1"
                        >
                          <span>Open Drive Folder</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <input
                      type="text"
                      value={settings.drive_folder_id || ''}
                      onChange={(e) => setSettings({ ...settings, drive_folder_id: e.target.value })}
                      placeholder="1803j-lPX2WNhkXJaPRbU5JUhRK8z74cj"
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-xs font-mono"
                    />
                    <p className="text-[11px] text-zinc-500 mt-1">
                      รองรับทั้ง Folder ID หรือวางลิงก์โฟลเดอร์ Google Drive เต็มรูปแบบ (โฟลเดอร์ทดสอบปัจจุบัน: 1803j-lPX2WNhkXJaPRbU5JUhRK8z74cj)
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-zinc-500 font-mono">
                    {settings.gas_spreadsheet_id
                      ? `Spreadsheet ID: ${settings.gas_spreadsheet_id}`
                      : 'No Spreadsheet initialized yet'}
                  </div>
                  <button
                    type="button"
                    onClick={handleTestAndInitGas}
                    disabled={gasBusy}
                    className="min-h-[42px] px-5 py-2 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white text-xs font-semibold disabled:opacity-50 transition-colors"
                  >
                    {gasBusy ? 'Connecting...' : 'Test & Initialize Sheets / Drive'}
                  </button>
                </div>
              </section>

              {/* Booth & Camera Configuration */}
              <section className="rounded-xl bg-white border border-zinc-200 p-6 space-y-5">
                <h2 className="font-display text-lg font-bold text-zinc-900">
                  Booth, Camera Adapter & Retention Settings
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Photo Booth Name</label>
                    <input
                      type="text"
                      value={settings.booth_name}
                      onChange={(e) => setSettings({ ...settings, booth_name: e.target.value })}
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Event Name</label>
                    <input
                      type="text"
                      value={settings.event_name}
                      onChange={(e) => setSettings({ ...settings, event_name: e.target.value })}
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Default Camera Adapter
                    </label>
                    <select
                      value={settings.camera_adapter}
                      onChange={(e) =>
                        setSettings({ ...settings, camera_adapter: e.target.value as CameraAdapterId })
                      }
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm"
                    >
                      {listCameraAdapters().map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Local Sony Bridge URL
                    </label>
                    <input
                      type="url"
                      value={settings.bridge_url}
                      onChange={(e) => setSettings({ ...settings, bridge_url: e.target.value })}
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Shot Countdown (Seconds)
                    </label>
                    <input
                      type="number"
                      min={3}
                      max={30}
                      value={settings.default_countdown_sec}
                      onChange={(e) =>
                        setSettings({ ...settings, default_countdown_sec: Number(e.target.value) })
                      }
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Final GIF Burst Window (Seconds)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={settings.gif_burst_seconds}
                      onChange={(e) =>
                        setSettings({ ...settings, gif_burst_seconds: Number(e.target.value) })
                      }
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Public QR Base URL (For cross-device scan if GAS not linked)
                    </label>
                    <input
                      type="url"
                      value={settings.public_qr_base_url || ''}
                      onChange={(e) =>
                        setSettings({ ...settings, public_qr_base_url: e.target.value })
                      }
                      placeholder="https://ais-pre-...run.app"
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      File Retention (Days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={settings.retention_days}
                      onChange={(e) => setSettings({ ...settings, retention_days: Number(e.target.value) })}
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Auto-Reset QR Screen (Seconds, 0 = Off)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      value={settings.auto_reset_seconds}
                      onChange={(e) =>
                        setSettings({ ...settings, auto_reset_seconds: Number(e.target.value) })
                      }
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">System Status</label>
                    <select
                      value={settings.system_status}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          system_status: e.target.value as 'active' | 'maintenance',
                        })
                      }
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm"
                    >
                      <option value="active">Active (Open to Guests)</option>
                      <option value="maintenance">Maintenance Mode</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Drive Sharing Privacy Mode
                    </label>
                    <select
                      value={settings.privacy_mode}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          privacy_mode: e.target.value as DrivePrivacyMode,
                        })
                      }
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm"
                    >
                      <option value="anyone_with_link">Anyone with the link (Fast Direct QR)</option>
                      <option value="token_proxy">Private Drive (Token Proxy Only)</option>
                    </select>
                  </div>
                </div>

                {networkInfo && (
                  <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 space-y-2.5 text-xs">
                    <p className="font-semibold text-zinc-900 flex items-center gap-1.5">
                      <Wifi className="w-4 h-4 text-emerald-600" />
                      <span>QR Code Cross-Device URL Helper</span>
                    </p>
                    <p className="text-zinc-600">
                      เพื่อให้มือถือเครื่องอื่นสแกน QR แล้วเปิดโหลดรูปได้ทันที: หากเชื่อม{' '}
                      <strong>GAS Web App URL</strong> ด้านบน ระบบจะชี้ QR ไปที่ Google Apps Script
                      (เปิดได้จากมือถือทุกเครือข่าย) หรือเลือกตั้งค่า Public / Wi-Fi LAN URL ด้านล่าง:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {networkInfo.lan_urls.map((lanUrl) => (
                        <button
                          key={lanUrl}
                          type="button"
                          onClick={() => setSettings({ ...settings, public_qr_base_url: lanUrl })}
                          className="px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 font-mono text-zinc-800"
                        >
                          Use Wi-Fi LAN: {lanUrl}
                        </button>
                      ))}
                      {networkInfo.shared_preview_url && (
                        <button
                          type="button"
                          onClick={() =>
                            setSettings({
                              ...settings,
                              public_qr_base_url: networkInfo.shared_preview_url,
                            })
                          }
                          className="px-3 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 font-mono text-zinc-800"
                        >
                          Use Shared URL: {networkInfo.shared_preview_url}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {settings.privacy_mode === 'anyone_with_link' && (
                  <p className="text-xs text-[#5E1421] bg-[#FDF2F4] border border-[#EAD5DA] rounded-xl p-3">
                    Privacy Note: Individual uploaded session files are shared as &ldquo;Anyone with the link&rdquo; for instant mobile download. Parent folders remain private, download links use random 32-char tokens, and expired files can be purged automatically.
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="min-h-[44px] px-6 py-2 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                  >
                    {savingSettings ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>
              </section>

              {/* Welcome Screen Text & Decorative Images Editor */}
              <section className="rounded-xl bg-white border border-[#EFEAEC] p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold text-zinc-900 flex items-center gap-2">
                      <ImagePlus className="w-5 h-5 text-[#7A1C2C]" />
                      <span>Welcome Screen &amp; Decorative Images</span>
                    </h2>
                    <p className="text-xs text-zinc-500 mt-1">
                      แก้ไขข้อความต้อนรับ โลโก้ ภาพพื้นหลัง และภาพตกแต่ง 3 ช่องบนหน้าแรกของตู้ถ่ายรูปได้เองทันที
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#7A1C2C] hover:bg-[#611421] text-white text-xs font-bold disabled:opacity-50 transition-colors"
                  >
                    {savingSettings ? 'Saving...' : 'Save Welcome Changes'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Welcome Headline (หัวข้อใหญ่หน้าแรก)
                    </label>
                    <input
                      type="text"
                      value={settings.welcome_headline || ''}
                      onChange={(e) => setSettings({ ...settings, welcome_headline: e.target.value })}
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Welcome Subtitle (คำอธิบายใต้หัวข้อ)
                    </label>
                    <textarea
                      rows={2}
                      value={settings.welcome_subtitle || ''}
                      onChange={(e) => setSettings({ ...settings, welcome_subtitle: e.target.value })}
                      className="w-full rounded-xl border border-zinc-200 p-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Start Button Label (ข้อความบนปุ่มเริ่ม)
                    </label>
                    <input
                      type="text"
                      value={settings.welcome_cta_label || ''}
                      onChange={(e) => setSettings({ ...settings, welcome_cta_label: e.target.value })}
                      className="w-full min-h-[42px] rounded-xl border border-zinc-200 px-3 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Brand Logo (โลโก้มุมบนซ้าย)
                    </label>
                    <div className="flex items-center gap-2">
                      {settings.logo_url && (
                        <img
                          src={settings.logo_url}
                          alt="Logo preview"
                          className="w-10 h-10 rounded-lg object-cover border border-zinc-200 shrink-0"
                        />
                      )}
                      <label className="flex-1 min-h-[42px] px-3 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-xs font-medium text-zinc-800 inline-flex items-center justify-center cursor-pointer">
                        <span>{uploadingAssetKey === 'logo' ? 'Uploading...' : 'Upload Logo PNG/JPG'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) =>
                            handleUploadWelcomeAsset('logo', e.target.files?.[0] || null)
                          }
                        />
                      </label>
                      {settings.logo_url && (
                        <button
                          type="button"
                          onClick={() => setSettings({ ...settings, logo_url: '' })}
                          className="min-h-[42px] px-3 rounded-xl border border-zinc-200 text-xs text-zinc-600 hover:bg-zinc-50"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Optional Welcome Background Image (ภาพพื้นหลังหน้าแรกแบบโปร่งจาง)
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      {settings.welcome_bg_url && (
                        <img
                          src={settings.welcome_bg_url}
                          alt="Welcome Background"
                          className="w-20 h-12 rounded-lg object-cover border border-zinc-200"
                        />
                      )}
                      <label className="min-h-[42px] px-4 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-xs font-medium text-zinc-800 inline-flex items-center cursor-pointer">
                        <span>
                          {uploadingAssetKey === 'bg' ? 'Uploading...' : 'Upload Background Image'}
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) =>
                            handleUploadWelcomeAsset('bg', e.target.files?.[0] || null)
                          }
                        />
                      </label>
                      {settings.welcome_bg_url && (
                        <button
                          type="button"
                          onClick={() => setSettings({ ...settings, welcome_bg_url: '' })}
                          className="min-h-[42px] px-3 rounded-xl border border-zinc-200 text-xs text-red-600 hover:bg-red-50"
                        >
                          Remove Background
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3 Showcase Decorative Images */}
                <div>
                  <p className="text-xs font-medium text-zinc-700 mb-2">
                    Welcome Showcase Decorative Photos (ภาพตกแต่ง 3 กรอบด้านขวาของหน้าแรก)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {(['hero0', 'hero1', 'hero2'] as const).map((key, idx) => {
                      const imgUrl = settings.welcome_hero_images?.[idx] || '';
                      return (
                        <div
                          key={key}
                          className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 flex flex-col gap-2.5"
                        >
                          <div className="aspect-[4/3] rounded-lg overflow-hidden bg-white border border-zinc-200">
                            {imgUrl ? (
                              <img
                                src={imgUrl}
                                alt={`Decor ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-zinc-400">
                                Empty Slot
                              </div>
                            )}
                          </div>
                          <label className="min-h-[38px] px-3 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-800 inline-flex items-center justify-center cursor-pointer">
                            <span>
                              {uploadingAssetKey === key
                                ? 'Uploading...'
                                : `Replace Photo ${idx + 1}`}
                            </span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="hidden"
                              onChange={(e) =>
                                handleUploadWelcomeAsset(key, e.target.files?.[0] || null)
                              }
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* TAB 6: SYSTEM LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {(['all', 'success', 'warning', 'error'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setLogFilter(f)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium capitalize ${
                      logFilter === f
                        ? 'bg-[#7A1C2C] text-white'
                        : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-[#FDF2F4]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              <div className="rounded-xl bg-white border border-zinc-200 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs text-zinc-500 border-b border-zinc-200">
                    <tr>
                      <th className="px-5 py-3 font-medium">Timestamp</th>
                      <th className="px-5 py-3 font-medium">Session</th>
                      <th className="px-5 py-3 font-medium">Action</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredLogs.map((l) => (
                      <tr key={l.log_id} className="hover:bg-zinc-50">
                        <td className="px-5 py-3 font-mono text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                          {new Date(l.timestamp).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-zinc-700">{l.session_id}</td>
                        <td className="px-5 py-3 font-mono text-xs text-zinc-900">{l.action}</td>
                        <td className="px-5 py-3 text-xs font-semibold uppercase">
                          <span
                            className={
                              l.status === 'error'
                                ? 'text-red-600'
                                : l.status === 'warning'
                                  ? 'text-amber-600'
                                  : l.status === 'success'
                                    ? 'text-emerald-600'
                                    : 'text-zinc-600'
                            }
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-zinc-700">{l.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: GAS & BRIDGE SETUP */}
          {activeTab === 'gas' && <GasExportToolkit />}
        </main>
      </div>

      {/* Canva Frame Layout Editor Modal */}
      <FrameLayoutEditorModal
        open={editorOpen}
        editingFrame={editingFrame}
        saving={savingFrame}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveFrame}
      />

      {/* Session QR Modal */}
      {inspectSession && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 border border-zinc-200 shadow-2xl text-center">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-zinc-900">{inspectSession.session_id}</h3>
              <button
                type="button"
                onClick={() => setInspectSession(null)}
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 flex justify-center">
              <QrCodeCanvas value={inspectSession.qr_url} size={220} />
            </div>
            <p className="mt-3 text-xs font-mono text-zinc-500 break-all">{inspectSession.qr_url}</p>
            <a
              href={`/download/${encodeURIComponent(inspectSession.download_token)}`}
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

      {/* Reusable Destructive Confirmation Modal */}
      {confirmState && (
        <ConfirmModal
          open={confirmState.open}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          busy={confirmBusy}
          onCancel={() => setConfirmState(null)}
          onConfirm={async () => {
            setConfirmBusy(true);
            try {
              await confirmState.onConfirm();
              setConfirmState(null);
            } finally {
              setConfirmBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
