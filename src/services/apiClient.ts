import type {
  AdminSettingsPayload,
  BoothSession,
  BoothSettings,
  CanvaFrame,
  DashboardStats,
  GasProjectFile,
  MediaItem,
  ShootingMode,
  SystemLog,
} from '../types';

// Stored strictly in memory (never localStorage or sessionStorage)
let adminBearerToken: string | null = null;

export function setAdminToken(token: string | null) {
  adminBearerToken = token;
}

export function getAdminToken(): string | null {
  return adminBearerToken;
}

async function requestJson<T>(url: string, init?: RequestInit, requireAdmin = false): Promise<T> {
  const headers = new Headers(init?.headers || {});
  if (!(init?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (requireAdmin && adminBearerToken) {
    headers.set('Authorization', `Bearer ${adminBearerToken}`);
  }

  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { error: text || `HTTP ${res.status}` };
  }

  if (!res.ok) {
    throw new Error(parsed.error || `Request failed (${res.status})`);
  }
  return parsed as T;
}

export const kioskApi = {
  getConfig: () =>
    requestJson<{ settings: BoothSettings; frames: CanvaFrame[] }>('/api/kiosk/config'),

  createSession: (payload: { selected_frame_id: string; shooting_mode: ShootingMode }) =>
    requestJson<{ session: BoothSession }>('/api/kiosk/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  uploadMediaWithRetry: async (
    payload: {
      session_id: string;
      media_type: MediaItem['media_type'];
      file_name: string;
      mime_type: string;
      blob: Blob;
      upload_key: string;
    },
    retries = 3
  ): Promise<{ media: MediaItem; deduplicated?: boolean }> => {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const form = new FormData();
        form.append('session_id', payload.session_id);
        form.append('media_type', payload.media_type);
        form.append('file_name', payload.file_name);
        form.append('mime_type', payload.mime_type);
        form.append('upload_key', payload.upload_key);
        form.append('file', payload.blob, payload.file_name);

        return await requestJson<{ media: MediaItem; deduplicated?: boolean }>('/api/kiosk/media', {
          method: 'POST',
          body: form,
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Upload failed');
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 700 * attempt));
        }
      }
    }
    throw lastError || new Error('Upload failed after retries');
  },

  finalizeSession: (sessionId: string) =>
    requestJson<{ session: BoothSession; media: MediaItem[] }>(
      `/api/kiosk/sessions/${encodeURIComponent(sessionId)}/finalize`,
      { method: 'POST' }
    ),

  getDownloadBundle: (token: string) =>
    requestJson<{ session: BoothSession; media: MediaItem[]; booth_name: string; event_name: string }>(
      `/api/download/${encodeURIComponent(token)}`
    ),
};

export const adminApi = {
  getAuthStatus: () =>
    requestJson<{ mode: 'env' | 'claimed' | 'unclaimed'; authenticated: boolean }>(
      '/api/admin/auth-status',
      undefined,
      true
    ),

  claimPasscode: (passcode: string) =>
    requestJson<{ token: string }>('/api/admin/claim', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    }),

  login: (passcode: string) =>
    requestJson<{ token: string }>('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    }),

  getDashboard: () =>
    requestJson<{
      stats: DashboardStats;
      settings: BoothSettings;
      frames: CanvaFrame[];
      sessions: BoothSession[];
      media: MediaItem[];
      logs: SystemLog[];
    }>('/api/admin/dashboard', undefined, true),

  saveFrame: (frame: Partial<CanvaFrame> & { pngDataUrl?: string }) =>
    requestJson<{ frame: CanvaFrame }>('/api/admin/frames', {
      method: 'POST',
      body: JSON.stringify(frame),
    }, true),

  toggleFrame: (frameId: string, is_active: boolean) =>
    requestJson<{ frame: CanvaFrame }>(`/api/admin/frames/${encodeURIComponent(frameId)}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active }),
    }, true),

  deleteFrame: (frameId: string) =>
    requestJson<{ ok: boolean }>(`/api/admin/frames/${encodeURIComponent(frameId)}`, {
      method: 'DELETE',
    }, true),

  updateSettings: (settings: Partial<AdminSettingsPayload>) =>
    requestJson<{ settings: BoothSettings }>('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }, true),

  testAndInitGas: (payload?: {
    gas_web_app_url?: string;
    gas_api_secret?: string;
    drive_folder_id?: string;
  }) =>
    requestJson<{
      ok: boolean;
      message: string;
      spreadsheet_id?: string;
      drive_folder_id?: string;
    }>('/api/admin/gas/init', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }, true),

  deleteMediaFile: (mediaId: string) =>
    requestJson<{ ok: boolean }>(`/api/admin/media/${encodeURIComponent(mediaId)}`, {
      method: 'DELETE',
    }, true),

  purgeExpiredFiles: () =>
    requestJson<{ deletedCount: number }>('/api/admin/media/purge-expired', {
      method: 'POST',
    }, true),

  changePasscode: (currentPasscode: string, newPasscode: string) =>
    requestJson<{ ok: boolean }>('/api/admin/change-passcode', {
      method: 'POST',
      body: JSON.stringify({ currentPasscode, newPasscode }),
    }, true),

  getGasExportFiles: () =>
    requestJson<{ files: GasProjectFile[]; bridgeScript: string }>('/api/admin/gas-export', undefined, true),

  uploadAsset: (fileName: string, dataUrl: string) =>
    requestJson<{ url: string }>('/api/admin/upload-asset', {
      method: 'POST',
      body: JSON.stringify({ fileName, dataUrl }),
    }, true),

  getNetworkInfo: () =>
    requestJson<{
      gas_connected: boolean;
      gas_web_app_url: string;
      public_qr_base_url: string;
      shared_preview_url: string;
      lan_urls: string[];
    }>('/api/admin/network-info', undefined, true),

  getStationFeed: () =>
    requestJson<{
      booth_name: string;
      event_name: string;
      gas_connected: boolean;
      sessions: Array<BoothSession & { media: MediaItem[] }>;
    }>('/api/station/feed', undefined, true),
};
