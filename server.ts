import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import type {
  AdminSettingsPayload,
  BoothSession,
  BoothSettings,
  CanvaFrame,
  DashboardStats,
  FrameSlot,
  GasProjectFile,
  MediaItem,
  ShootingMode,
  SystemLog,
} from './src/types';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.cwd(), '.booth-data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const ADMIN_PATH = path.join(DATA_DIR, 'admin.json');
const SIGNING_KEY = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

interface ServerSecrets {
  gas_web_app_url: string;
  gas_api_secret: string;
}

interface BoothStore {
  settings: BoothSettings;
  secrets: ServerSecrets;
  frames: CanvaFrame[];
  sessions: BoothSession[];
  media: MediaItem[];
  logs: SystemLog[];
}

interface AdminAuthFile {
  passcodeHash: string;
  salt: string;
  claimedAt: string;
}

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// --- Pure Node Transparent PNG Generator for Starter Canva Templates ---
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const combined = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(combined), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function generateTransparentFramePng(
  width: number,
  height: number,
  slots: FrameSlot[],
  bgRgba: [number, number, number, number],
  borderRgba: [number, number, number, number]
): Buffer {
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(rowSize * height);

  const slotRects = slots.map((s) => ({
    x1: Math.round((s.x / 100) * width),
    y1: Math.round((s.y / 100) * height),
    x2: Math.round(((s.x + s.width) / 100) * width),
    y2: Math.round(((s.y + s.height) / 100) * height),
  }));

  const borderPx = Math.max(4, Math.round(Math.min(width, height) * 0.006));

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      let insideSlot = false;
      let onSlotBorder = false;

      for (const r of slotRects) {
        if (x >= r.x1 && x < r.x2 && y >= r.y1 && y < r.y2) {
          insideSlot = true;
          break;
        }
        if (
          x >= r.x1 - borderPx &&
          x < r.x2 + borderPx &&
          y >= r.y1 - borderPx &&
          y < r.y2 + borderPx
        ) {
          onSlotBorder = true;
        }
      }

      if (insideSlot) {
        raw[pxOffset] = 0;
        raw[pxOffset + 1] = 0;
        raw[pxOffset + 2] = 0;
        raw[pxOffset + 3] = 0;
      } else if (onSlotBorder) {
        raw[pxOffset] = borderRgba[0];
        raw[pxOffset + 1] = borderRgba[1];
        raw[pxOffset + 2] = borderRgba[2];
        raw[pxOffset + 3] = borderRgba[3];
      } else {
        raw[pxOffset] = bgRgba[0];
        raw[pxOffset + 1] = bgRgba[1];
        raw[pxOffset + 2] = bgRgba[2];
        raw[pxOffset + 3] = bgRgba[3];
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const DEFAULT_TEST_DRIVE_FOLDER_ID = '1803j-lPX2WNhkXJaPRbU5JUhRK8z74cj';

function extractDriveFolderId(raw: string | undefined): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  const folderMatch = value.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  const idMatch = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function defaultSettings(): BoothSettings {
  return {
    booth_name: 'BoostBooth Studio',
    event_name: 'Signature Event 2026',
    logo_url: '',
    welcome_headline: 'Step in, strike a pose, and take the moment home.',
    welcome_subtitle: '',
    welcome_cta_label: 'START',
    welcome_hero_images: [
      '/src/assets/images/welcome_studio_hero_1795415053626.jpg',
      '/src/assets/images/welcome_booth_couple_1795415054211.jpg',
      '/src/assets/images/welcome_booth_party_1795415053857.jpg',
    ],
    welcome_bg_url: '',
    drive_folder_id: DEFAULT_TEST_DRIVE_FOLDER_ID,
    retention_days: 7,
    max_photos_per_session: 4,
    default_countdown_sec: 10,
    gif_burst_seconds: 3,
    public_qr_base_url: '',
    system_status: 'active',
    camera_adapter: 'browser-webcam',
    bridge_url: 'http://localhost:8765',
    preferred_video_device_id: '',
    privacy_mode: 'anyone_with_link',
    auto_reset_seconds: 60,
    gas_web_app_url_configured: Boolean(process.env.GAS_WEB_APP_URL),
    gas_spreadsheet_id: '',
    gas_last_sync_at: '',
  };
}

function createStarterFrames(): CanvaFrame[] {
  const now = new Date().toISOString();

  const definitions: Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    width: number;
    height: number;
    bg: [number, number, number, number];
    border: [number, number, number, number];
    slots: FrameSlot[];
  }> = [
    {
      id: 'FRM_EDITORIAL_4X5',
      name: 'Editorial Studio Portrait',
      category: 'Portrait',
      description: 'Single-shot vertical portrait frame (4:5).',
      width: 960,
      height: 1200,
      bg: [255, 255, 255, 255],
      border: [122, 28, 44, 255],
      slots: [
        { id: 'slot-1', label: 'Photo 1', x: 7, y: 6, width: 86, height: 76, fit: 'cover' },
      ],
    },
    {
      id: 'FRM_STRIP_3SHOT',
      name: 'Gallery 3-Shot Strip',
      category: 'Multi-Shot',
      description: '3-frame vertical photo strip for multi-pose sessions.',
      width: 640,
      height: 1600,
      bg: [255, 255, 255, 255],
      border: [122, 28, 44, 255],
      slots: [
        { id: 'slot-1', label: 'Shot 1', x: 8, y: 5, width: 84, height: 25, fit: 'cover' },
        { id: 'slot-2', label: 'Shot 2', x: 8, y: 33, width: 84, height: 25, fit: 'cover' },
        { id: 'slot-3', label: 'Shot 3', x: 8, y: 61, width: 84, height: 25, fit: 'cover' },
      ],
    },
    {
      id: 'FRM_DUO_LANDSCAPE',
      name: 'Gallery Duo Landscape',
      category: 'Landscape',
      description: 'Two-frame horizontal layout tailored for couples and group shots.',
      width: 1440,
      height: 960,
      bg: [248, 250, 252, 255],
      border: [24, 24, 27, 200],
      slots: [
        { id: 'slot-1', label: 'Left Pose', x: 5, y: 10, width: 43, height: 72, fit: 'cover' },
        { id: 'slot-2', label: 'Right Pose', x: 52, y: 10, width: 43, height: 72, fit: 'cover' },
      ],
    },
  ];

  return definitions.map((def) => {
    const fileName = `frame_${def.id}.png`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      const pngBuffer = generateTransparentFramePng(def.width, def.height, def.slots, def.bg, def.border);
      fs.writeFileSync(filePath, pngBuffer);
    }
    return {
      frame_id: def.id,
      frame_name: def.name,
      category: def.category,
      description: def.description,
      drive_file_id: '',
      preview_url: `/uploads/${fileName}`,
      width: def.width,
      height: def.height,
      frame_layout: def.slots,
      is_active: true,
      is_starter: true,
      created_at: now,
    };
  });
}

function loadStore(): BoothStore {
  ensureDirs();
  if (!fs.existsSync(STORE_PATH)) {
    const initial: BoothStore = {
      settings: defaultSettings(),
      secrets: {
        gas_web_app_url: process.env.GAS_WEB_APP_URL || '',
        gas_api_secret: process.env.GAS_API_SECRET || '',
      },
      frames: createStarterFrames(),
      sessions: [],
      media: [],
      logs: [
        {
          log_id: `LOG_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          timestamp: new Date().toISOString(),
          session_id: 'SYSTEM',
          action: 'BOOT_WORKSPACE',
          status: 'info',
          message: 'Initialized BoostBooth workspace with Photo + 3s GIF workflow.',
        },
      ],
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }

  const raw = fs.readFileSync(STORE_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<BoothStore>;
  const rawSettings = { ...(parsed.settings || {}) } as Record<string, unknown>;
  delete rawSettings.beauty_retouch_enabled;
  delete rawSettings.video_duration_options;
  delete rawSettings.default_video_duration_sec;
  const settings = { ...defaultSettings(), ...(rawSettings as Partial<BoothSettings>) };
  if (
    settings.welcome_subtitle &&
    settings.welcome_subtitle.startsWith('Pick a custom Canva frame')
  ) {
    settings.welcome_subtitle = '';
  }
  if (settings.welcome_cta_label === 'Start Photo Booth') {
    settings.welcome_cta_label = 'START';
  }
  if (!settings.default_countdown_sec) {
    settings.default_countdown_sec = 10;
  }
  settings.drive_folder_id =
    extractDriveFolderId(settings.drive_folder_id) || DEFAULT_TEST_DRIVE_FOLDER_ID;
  const secrets: ServerSecrets = {
    gas_web_app_url: parsed.secrets?.gas_web_app_url || process.env.GAS_WEB_APP_URL || '',
    gas_api_secret: parsed.secrets?.gas_api_secret || process.env.GAS_API_SECRET || '',
  };
  settings.gas_web_app_url_configured = Boolean(secrets.gas_web_app_url);

  return {
    settings,
    secrets,
    frames: parsed.frames || [],
    sessions: parsed.sessions || [],
    media: parsed.media || [],
    logs: parsed.logs || [],
  };
}

let store: BoothStore = loadStore();

function saveStore() {
  ensureDirs();
  store.settings.gas_web_app_url_configured = Boolean(store.secrets.gas_web_app_url);
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function appendLog(sessionId: string, action: string, status: SystemLog['status'], message: string) {
  const entry: SystemLog = {
    log_id: `LOG_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    timestamp: new Date().toISOString(),
    session_id: sessionId || 'SYSTEM',
    action,
    status,
    message,
  };
  store.logs.unshift(entry);
  if (store.logs.length > 500) {
    store.logs = store.logs.slice(0, 500);
  }
  saveStore();
}

// --- SSRF-Safe Google Apps Script Web App Client ---
function validateGasUrl(urlStr: string): URL {
  const parsed = new URL(urlStr);
  if (parsed.protocol !== 'https:') {
    throw new Error('GAS Web App URL must use HTTPS.');
  }
  const allowedHosts = ['script.google.com', 'script.googleusercontent.com'];
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error('GAS Web App URL must point to script.google.com.');
  }
  return parsed;
}

async function callGasBackend<T = any>(
  action: string,
  payload: Record<string, unknown> = {},
  overrideUrl?: string,
  overrideSecret?: string
): Promise<T | null> {
  const targetUrl = (overrideUrl ?? store.secrets.gas_web_app_url).trim();
  const secret = (overrideSecret ?? store.secrets.gas_api_secret).trim();
  if (!targetUrl) return null;

  const validated = validateGasUrl(targetUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);

  try {
    const res = await fetch(validated.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, secret, payload }),
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('GAS returned non-JSON response. Verify Web App deployment permissions ("Anyone").');
    }
    if (!json.ok) {
      throw new Error(json.error || `GAS error on action ${action}`);
    }
    store.settings.gas_last_sync_at = new Date().toISOString();
    saveStore();
    return json.result as T;
  } finally {
    clearTimeout(timer);
  }
}

// --- Admin Authentication (scrypt + HMAC-SHA256 Bearer Token) ---
function readAdminFile(): AdminAuthFile | null {
  if (!fs.existsSync(ADMIN_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(ADMIN_PATH, 'utf-8')) as AdminAuthFile;
  } catch {
    return null;
  }
}

function getAuthMode(): 'env' | 'claimed' | 'unclaimed' {
  if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0) {
    return 'env';
  }
  return readAdminFile() ? 'claimed' : 'unclaimed';
}

function hashPasscode(passcode: string, salt: string): string {
  return crypto.scryptSync(passcode, salt, 64).toString('hex');
}

function verifyPasscode(passcode: string): boolean {
  const envPass = (process.env.ADMIN_PASSCODE || '').trim();
  if (envPass) {
    const a = Buffer.from(passcode);
    const b = Buffer.from(envPass);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const file = readAdminFile();
  if (!file) return false;
  const candidate = hashPasscode(passcode, file.salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(file.passcodeHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function issueAdminBearerToken(): string {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const payloadB64 = Buffer.from(JSON.stringify({ role: 'admin', exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', SIGNING_KEY).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyAdminBearerToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SIGNING_KEY).update(payloadB64).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    return parsed.role === 'admin' && Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}

function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!verifyAdminBearerToken(token)) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  next();
}

// --- Zero-Dependency Multipart FormData Parser ---
interface ParsedMultipart {
  fields: Record<string, string>;
  files: Array<{ fieldName: string; fileName: string; contentType: string; data: Buffer }>;
}

function parseMultipartBody(body: Buffer, contentType: string): ParsedMultipart {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) {
    throw new Error('Missing multipart boundary.');
  }
  const boundary = match[1] || match[2];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  const files: ParsedMultipart['files'] = [];

  let pos = body.indexOf(boundaryBuf);
  while (pos !== -1) {
    const nextPos = body.indexOf(boundaryBuf, pos + boundaryBuf.length);
    if (nextPos === -1) break;

    let part = body.subarray(pos + boundaryBuf.length, nextPos);
    if (part.subarray(0, 2).toString() === '\r\n') part = part.subarray(2);
    if (part.subarray(part.length - 2).toString() === '\r\n') part = part.subarray(0, part.length - 2);

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headersRaw = part.subarray(0, headerEnd).toString('utf-8');
      const contentBuf = part.subarray(headerEnd + 4);
      const nameMatch = headersRaw.match(/name="([^"]+)"/i);
      const fileMatch = headersRaw.match(/filename="([^"]*)"/i);
      const typeMatch = headersRaw.match(/Content-Type:\s*([^\r\n]+)/i);

      if (nameMatch) {
        const fieldName = nameMatch[1];
        if (fileMatch) {
          files.push({
            fieldName,
            fileName: path.basename(fileMatch[1] || 'upload.bin'),
            contentType: (typeMatch?.[1] || 'application/octet-stream').trim(),
            data: contentBuf,
          });
        } else {
          fields[fieldName] = contentBuf.toString('utf-8');
        }
      }
    }
    pos = nextPos;
  }

  return { fields, files };
}

function getSafeUploadPath(fileName: string): string {
  const cleanName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const resolved = path.resolve(UPLOADS_DIR, cleanName);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error('Invalid upload file path.');
  }
  return resolved;
}

function publicSettingsView(): BoothSettings {
  return { ...store.settings };
}

function getLanUrls(): string[] {
  const urls: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const info of list) {
      if (info.family === 'IPv4' && !info.internal) {
        urls.push(`http://${info.address}:${PORT}`);
      }
    }
  }
  return urls;
}

function buildAppBaseUrl(req: express.Request): string {
  if (process.env.APP_URL && !process.env.APP_URL.includes('MY_APP_URL')) {
    return process.env.APP_URL.replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function resolveQrDownloadUrl(req: express.Request, downloadToken: string): string {
  // 1. If Google Apps Script Web App is connected, point QR directly to its public endpoint
  //    so any iPhone or Android device can scan and open immediately!
  if (store.secrets.gas_web_app_url) {
    const cleanGas = store.secrets.gas_web_app_url.replace(/\/+$/, '');
    return `${cleanGas}?page=download&token=${encodeURIComponent(downloadToken)}`;
  }

  // 2. If Admin configured a Public Shared URL (e.g. https://ais-pre-...run.app or Cloudflare/ngrok tunnel), use it!
  if (store.settings.public_qr_base_url && store.settings.public_qr_base_url.trim()) {
    const cleanPublic = store.settings.public_qr_base_url.trim().replace(/\/+$/, '');
    return `${cleanPublic}/download/${encodeURIComponent(downloadToken)}`;
  }

  // 3. Fallback to current request origin (convert ais-dev- to ais-pre- on Cloud Run, or localhost to LAN IP on Wi-Fi)
  let baseUrl = buildAppBaseUrl(req);
  if (baseUrl.includes('ais-dev-')) {
    baseUrl = baseUrl.replace('ais-dev-', 'ais-pre-');
  } else if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
    const lan = getLanUrls();
    if (lan.length > 0) {
      baseUrl = lan[0];
    }
  }
  return `${baseUrl}/download/${encodeURIComponent(downloadToken)}`;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=*, microphone=()');
    next();
  });

  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/api/kiosk/media', express.raw({ type: 'multipart/form-data', limit: '80mb' }));
  app.use(express.json({ limit: '25mb' }));

  // --- Public Kiosk Endpoints ---
  app.get('/api/kiosk/config', (_req, res) => {
    const publicSettings = publicSettingsView();
    publicSettings.drive_folder_id = '';
    publicSettings.gas_spreadsheet_id = '';
    res.json({
      settings: publicSettings,
      frames: store.frames.filter((f) => f.is_active),
    });
  });

  app.post('/api/kiosk/sessions', async (req, res) => {
    try {
      const { selected_frame_id, shooting_mode } = req.body as {
        selected_frame_id: string;
        shooting_mode: ShootingMode;
      };
      const frame = store.frames.find((f) => f.frame_id === selected_frame_id && f.is_active);
      if (!frame) {
        res.status(400).json({ error: 'Selected frame is invalid or inactive.' });
        return;
      }

      const seq = String(store.sessions.length + 1).padStart(3, '0');
      const sessionId = `SESSION_${seq}_${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const downloadToken = crypto.randomBytes(16).toString('hex');
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + (store.settings.retention_days || 7) * 24 * 60 * 60 * 1000
      );
      const qrUrl = resolveQrDownloadUrl(req, downloadToken);

      const session: BoothSession = {
        session_id: sessionId,
        created_at: now.toISOString(),
        selected_frame_id: frame.frame_id,
        selected_frame_name: frame.frame_name,
        shooting_mode: shooting_mode || 'photo+gif',
        session_status: 'capturing',
        drive_folder_id: '',
        download_token: downloadToken,
        qr_url: qrUrl,
        expires_at: expiresAt.toISOString(),
      };

      if (store.secrets.gas_web_app_url) {
        try {
          const gasResult = await callGasBackend<{ drive_folder_id?: string; qr_url?: string }>(
            'createSession',
            {
              session_id: session.session_id,
              selected_frame_id: session.selected_frame_id,
              shooting_mode: session.shooting_mode,
              download_token: session.download_token,
              qr_url: session.qr_url,
              app_base_url: buildAppBaseUrl(req),
              drive_folder_id: extractDriveFolderId(store.settings.drive_folder_id),
            }
          );
          if (gasResult?.drive_folder_id) session.drive_folder_id = gasResult.drive_folder_id;
          if (gasResult?.qr_url) session.qr_url = gasResult.qr_url;
        } catch (err) {
          appendLog(
            session.session_id,
            'GAS_CREATE_SESSION',
            'warning',
            `GAS sync failed (kept local session): ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      store.sessions.unshift(session);
      appendLog(session.session_id, 'CREATE_SESSION', 'success', `Started Photo+GIF session with frame ${frame.frame_name}`);

      res.json({
        session: {
          ...session,
          drive_folder_id: '',
        },
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create session.' });
    }
  });

  app.post('/api/kiosk/media', async (req, res) => {
    try {
      const contentType = req.headers['content-type'] || '';
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: 'Expected multipart/form-data payload.' });
        return;
      }

      const { fields, files } = parseMultipartBody(req.body, contentType);
      const sessionId = fields.session_id;
      const mediaType = (fields.media_type || 'framed') as MediaItem['media_type'];
      const uploadKey = fields.upload_key || '';
      const filePart = files[0];

      if (!sessionId || !filePart) {
        res.status(400).json({ error: 'session_id and file are required.' });
        return;
      }

      const session = store.sessions.find((s) => s.session_id === sessionId);
      if (!session) {
        res.status(404).json({ error: 'Session not found.' });
        return;
      }

      if (uploadKey) {
        const existing = store.media.find(
          (m) => m.session_id === sessionId && m.upload_key === uploadKey
        );
        if (existing) {
          res.json({ media: existing, deduplicated: true });
          return;
        }
      }

      const ext = path.extname(filePart.fileName) || (mediaType === 'gif' ? '.gif' : '.jpg');
      const storedName = `${sessionId}_${mediaType}_${crypto.randomBytes(4).toString('hex')}${ext}`;
      const diskPath = getSafeUploadPath(storedName);
      fs.writeFileSync(diskPath, filePart.data);

      const mediaItem: MediaItem = {
        media_id: `MED_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        session_id: sessionId,
        media_type: mediaType,
        original_file_id: '',
        processed_file_id: '',
        file_name: filePart.fileName || storedName,
        file_size: filePart.data.length,
        mime_type: fields.mime_type || filePart.contentType,
        created_at: new Date().toISOString(),
        upload_status: 'uploaded',
        public_url: `/uploads/${storedName}`,
        upload_key: uploadKey,
        expires_at: session.expires_at,
      };

      if (store.secrets.gas_web_app_url && filePart.data.length <= 22 * 1024 * 1024) {
        try {
          const gasRes = await callGasBackend<{
            original_file_id?: string;
            processed_file_id?: string;
            drive_download_url?: string;
          }>('uploadMedia', {
            media_id: mediaItem.media_id,
            session_id: sessionId,
            media_type: mediaType,
            file_name: mediaItem.file_name,
            mime_type: mediaItem.mime_type,
            drive_folder_id: extractDriveFolderId(store.settings.drive_folder_id),
            base64Data: filePart.data.toString('base64'),
          });
          if (gasRes) {
            mediaItem.original_file_id = gasRes.original_file_id || '';
            mediaItem.processed_file_id = gasRes.processed_file_id || '';
            mediaItem.drive_download_url = gasRes.drive_download_url || '';
            mediaItem.upload_status = 'synced_drive';
          }
        } catch (err) {
          appendLog(
            sessionId,
            'GAS_UPLOAD_MEDIA',
            'warning',
            `Stored locally; Drive sync failed for ${mediaItem.file_name}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      store.media.unshift(mediaItem);
      appendLog(
        sessionId,
        'UPLOAD_MEDIA',
        'success',
        `Saved ${mediaItem.media_type} (${mediaItem.file_size} bytes)`
      );

      res.json({ media: mediaItem });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Media upload failed.' });
    }
  });

  app.post('/api/kiosk/sessions/:sessionId/finalize', async (req, res) => {
    const { sessionId } = req.params;
    const session = store.sessions.find((s) => s.session_id === sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found.' });
      return;
    }

    const sessionMedia = store.media.filter((m) => m.session_id === sessionId);
    if (sessionMedia.length === 0) {
      res.status(400).json({ error: 'Cannot generate QR Code before at least one media file is uploaded.' });
      return;
    }

    session.session_status = 'ready';
    saveStore();
    appendLog(sessionId, 'FINALIZE_SESSION', 'success', `QR Code ready with ${sessionMedia.length} media file(s).`);

    if (store.secrets.gas_web_app_url) {
      callGasBackend('updateSessionStatus', { session_id: sessionId, session_status: 'ready' }).catch(() => {});
    }

    res.json({
      session: { ...session, drive_folder_id: '' },
      media: sessionMedia,
    });
  });

  // --- Public Mobile QR Download Endpoint ---
  app.get('/api/download/:token', (req, res) => {
    const { token } = req.params;
    const session = store.sessions.find((s) => s.download_token === token);
    if (!session) {
      res.status(404).json({ error: 'Download session not found or link is invalid.' });
      return;
    }
    if (
      session.session_status === 'expired' ||
      (session.expires_at && new Date(session.expires_at).getTime() < Date.now())
    ) {
      res.status(410).json({ error: 'This photo booth download link has expired.' });
      return;
    }

    const media = store.media.filter((m) => m.session_id === session.session_id);
    res.json({
      session: { ...session, drive_folder_id: '' },
      media,
      booth_name: store.settings.booth_name,
      event_name: store.settings.event_name,
    });
  });

  app.get('/api/download-file/:mediaId', (req, res) => {
    const item = store.media.find((m) => m.media_id === req.params.mediaId);
    if (!item) {
      res.status(404).send('File not found.');
      return;
    }
    const storedName = path.basename(item.public_url);
    const diskPath = getSafeUploadPath(storedName);
    if (!fs.existsSync(diskPath)) {
      if (item.drive_download_url) {
        res.redirect(item.drive_download_url);
        return;
      }
      res.status(404).send('File missing from storage.');
      return;
    }
    res.setHeader('Content-Type', item.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${item.file_name.replace(/"/g, '')}"`);
    fs.createReadStream(diskPath).pipe(res);
  });

  // --- Admin Auth Routes ---
  app.get('/api/admin/auth-status', (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    res.json({
      mode: getAuthMode(),
      authenticated: verifyAdminBearerToken(token),
    });
  });

  app.post('/api/admin/claim', (req, res) => {
    if (getAuthMode() !== 'unclaimed') {
      res.status(409).json({ error: 'Admin passcode has already been configured.' });
      return;
    }
    const passcode = String(req.body?.passcode || '').trim();
    if (passcode.length < 4) {
      res.status(400).json({ error: 'Passcode must be at least 4 characters.' });
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const record: AdminAuthFile = {
      passcodeHash: hashPasscode(passcode, salt),
      salt,
      claimedAt: new Date().toISOString(),
    };
    fs.writeFileSync(ADMIN_PATH, JSON.stringify(record, null, 2));
    appendLog('ADMIN', 'CLAIM_PASSCODE', 'success', 'Initial Admin passcode claimed.');
    res.json({ token: issueAdminBearerToken() });
  });

  app.post('/api/admin/login', (req, res) => {
    if (getAuthMode() === 'unclaimed') {
      res.status(400).json({ error: 'No admin passcode configured yet. Claim initial passcode first.' });
      return;
    }
    const passcode = String(req.body?.passcode || '').trim();
    if (!verifyPasscode(passcode)) {
      appendLog('ADMIN', 'LOGIN_FAILED', 'warning', 'Invalid admin passcode attempt.');
      res.status(401).json({ error: 'Incorrect admin passcode.' });
      return;
    }
    res.json({ token: issueAdminBearerToken() });
  });

  app.post('/api/admin/change-passcode', requireAdminAuth, (req, res) => {
    if (getAuthMode() === 'env') {
      res.status(400).json({ error: 'Passcode is controlled by ADMIN_PASSCODE environment secret.' });
      return;
    }
    const currentPasscode = String(req.body?.currentPasscode || '').trim();
    const newPasscode = String(req.body?.newPasscode || '').trim();
    if (!verifyPasscode(currentPasscode)) {
      res.status(401).json({ error: 'Current passcode is incorrect.' });
      return;
    }
    if (newPasscode.length < 4) {
      res.status(400).json({ error: 'New passcode must be at least 4 characters.' });
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(
      ADMIN_PATH,
      JSON.stringify({ passcodeHash: hashPasscode(newPasscode, salt), salt, claimedAt: new Date().toISOString() }, null, 2)
    );
    appendLog('ADMIN', 'CHANGE_PASSCODE', 'success', 'Updated admin passcode.');
    res.json({ ok: true });
  });

  // --- Protected Admin Routes ---
  app.get('/api/admin/dashboard', requireAdminAuth, (_req, res) => {
    const now = Date.now();
    let totalBytes = 0;
    let totalPhotos = 0;
    let totalGifs = 0;
    let expiredFiles = 0;

    for (const m of store.media) {
      totalBytes += m.file_size || 0;
      if (m.media_type === 'gif') totalGifs++;
      else totalPhotos++;
      if (m.expires_at && new Date(m.expires_at).getTime() < now) {
        expiredFiles++;
      }
    }

    const sessionsWithCounts = store.sessions.map((s) => ({
      ...s,
      media_count: store.media.filter((m) => m.session_id === s.session_id).length,
    }));

    const stats: DashboardStats = {
      total_sessions: store.sessions.length,
      total_photos: totalPhotos,
      total_gifs: totalGifs,
      storage_used_bytes: totalBytes,
      active_frames: store.frames.filter((f) => f.is_active).length,
      expired_files: expiredFiles,
      gas_connected: Boolean(store.secrets.gas_web_app_url),
      gas_spreadsheet_id: store.settings.gas_spreadsheet_id,
      drive_folder_id: store.settings.drive_folder_id,
    };

    res.json({
      stats,
      settings: publicSettingsView(),
      frames: store.frames,
      sessions: sessionsWithCounts,
      media: store.media,
      logs: store.logs,
    });
  });

  app.post('/api/admin/frames', requireAdminAuth, async (req, res) => {
    try {
      const body = req.body as Partial<CanvaFrame> & { pngDataUrl?: string };
      const frameId = body.frame_id || `FRM_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const existingIdx = store.frames.findIndex((f) => f.frame_id === frameId);

      let previewUrl = body.preview_url || (existingIdx !== -1 ? store.frames[existingIdx].preview_url : '');
      let driveFileId = body.drive_file_id || (existingIdx !== -1 ? store.frames[existingIdx].drive_file_id : '');
      let pngBase64: string | undefined;

      if (body.pngDataUrl && body.pngDataUrl.startsWith('data:image/png;base64,')) {
        pngBase64 = body.pngDataUrl.replace(/^data:image\/png;base64,/, '');
        const fileName = `frame_${frameId}.png`;
        const diskPath = getSafeUploadPath(fileName);
        fs.writeFileSync(diskPath, Buffer.from(pngBase64, 'base64'));
        previewUrl = `/uploads/${fileName}?v=${Date.now()}`;
      }

      if (!previewUrl) {
        res.status(400).json({ error: 'Please upload a transparent PNG frame from Canva.' });
        return;
      }

      const frameRecord: CanvaFrame = {
        frame_id: frameId,
        frame_name: String(body.frame_name || 'Untitled Canva Frame').trim(),
        category: String(body.category || 'Event').trim(),
        description: String(body.description || '').trim(),
        drive_file_id: driveFileId,
        preview_url: previewUrl,
        width: Number(body.width) || 1200,
        height: Number(body.height) || 1800,
        frame_layout: Array.isArray(body.frame_layout) ? body.frame_layout : [],
        is_active: body.is_active !== false,
        is_starter: false,
        created_at:
          existingIdx !== -1 ? store.frames[existingIdx].created_at : new Date().toISOString(),
      };

      if (store.secrets.gas_web_app_url) {
        try {
          const gasFrame = await callGasBackend<CanvaFrame>('saveFrame', {
            ...frameRecord,
            drive_folder_id: extractDriveFolderId(store.settings.drive_folder_id),
            pngBase64,
          });
          if (gasFrame?.drive_file_id) {
            frameRecord.drive_file_id = gasFrame.drive_file_id;
          }
        } catch (err) {
          appendLog(
            'ADMIN',
            'GAS_SAVE_FRAME',
            'warning',
            `Saved frame locally; GAS sync error: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      if (existingIdx !== -1) {
        store.frames[existingIdx] = frameRecord;
        appendLog('ADMIN', 'UPDATE_FRAME', 'success', `Updated frame ${frameRecord.frame_name}`);
      } else {
        store.frames.unshift(frameRecord);
        appendLog('ADMIN', 'CREATE_FRAME', 'success', `Added Canva frame ${frameRecord.frame_name}`);
      }
      saveStore();
      res.json({ frame: frameRecord });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save frame.' });
    }
  });

  app.patch('/api/admin/frames/:frameId/toggle', requireAdminAuth, async (req, res) => {
    const frame = store.frames.find((f) => f.frame_id === req.params.frameId);
    if (!frame) {
      res.status(404).json({ error: 'Frame not found.' });
      return;
    }
    frame.is_active = Boolean(req.body?.is_active);
    saveStore();
    appendLog('ADMIN', 'TOGGLE_FRAME', 'info', `${frame.frame_name} active=${frame.is_active}`);
    if (store.secrets.gas_web_app_url) {
      callGasBackend('toggleFrame', { frame_id: frame.frame_id, is_active: frame.is_active }).catch(() => {});
    }
    res.json({ frame });
  });

  app.delete('/api/admin/frames/:frameId', requireAdminAuth, async (req, res) => {
    const idx = store.frames.findIndex((f) => f.frame_id === req.params.frameId);
    if (idx === -1) {
      res.status(404).json({ error: 'Frame not found.' });
      return;
    }
    const removed = store.frames[idx];
    store.frames.splice(idx, 1);
    saveStore();
    appendLog('ADMIN', 'DELETE_FRAME', 'success', `Deleted frame ${removed.frame_name}`);

    if (store.secrets.gas_web_app_url) {
      callGasBackend('deleteFrame', { frame_id: removed.frame_id }).catch(() => {});
    }
    res.json({ ok: true });
  });

  app.put('/api/admin/settings', requireAdminAuth, async (req, res) => {
    try {
      const payload = req.body as Partial<AdminSettingsPayload>;
      if (typeof payload.gas_web_app_url === 'string') {
        const trimmed = payload.gas_web_app_url.trim();
        if (trimmed) validateGasUrl(trimmed);
        store.secrets.gas_web_app_url = trimmed;
      }
      if (typeof payload.gas_api_secret === 'string' && payload.gas_api_secret.trim()) {
        store.secrets.gas_api_secret = payload.gas_api_secret.trim();
      }

      const allowedKeys: Array<keyof BoothSettings> = [
        'booth_name',
        'event_name',
        'logo_url',
        'welcome_headline',
        'welcome_subtitle',
        'welcome_cta_label',
        'welcome_hero_images',
        'welcome_bg_url',
        'drive_folder_id',
        'retention_days',
        'max_photos_per_session',
        'default_countdown_sec',
        'gif_burst_seconds',
        'public_qr_base_url',
        'system_status',
        'camera_adapter',
        'bridge_url',
        'preferred_video_device_id',
        'privacy_mode',
        'auto_reset_seconds',
      ];

      for (const k of allowedKeys) {
        if (payload[k] !== undefined) {
          (store.settings as any)[k] = payload[k];
        }
      }
      store.settings.drive_folder_id = extractDriveFolderId(store.settings.drive_folder_id);
      saveStore();
      appendLog('ADMIN', 'UPDATE_SETTINGS', 'success', 'Saved system and camera settings.');

      if (store.secrets.gas_web_app_url) {
        callGasBackend('updateSettings', {
          booth_name: store.settings.booth_name,
          event_name: store.settings.event_name,
          drive_folder_id: store.settings.drive_folder_id,
          retention_days: String(store.settings.retention_days),
          default_countdown_sec: String(store.settings.default_countdown_sec),
          gif_burst_seconds: String(store.settings.gif_burst_seconds),
          system_status: store.settings.system_status,
          privacy_mode: store.settings.privacy_mode,
        }).catch(() => {});
      }

      res.json({ settings: publicSettingsView() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid settings.' });
    }
  });

  app.post('/api/admin/gas/init', requireAdminAuth, async (req, res) => {
    try {
      const overrideUrl = typeof req.body?.gas_web_app_url === 'string' ? req.body.gas_web_app_url.trim() : undefined;
      const overrideSecret = typeof req.body?.gas_api_secret === 'string' ? req.body.gas_api_secret.trim() : undefined;

      if (overrideUrl) {
        validateGasUrl(overrideUrl);
        store.secrets.gas_web_app_url = overrideUrl;
      }
      if (overrideSecret) {
        store.secrets.gas_api_secret = overrideSecret;
      }

      const overrideFolderId =
        typeof req.body?.drive_folder_id === 'string'
          ? extractDriveFolderId(req.body.drive_folder_id)
          : '';
      const targetFolderId =
        overrideFolderId || extractDriveFolderId(store.settings.drive_folder_id) || DEFAULT_TEST_DRIVE_FOLDER_ID;
      store.settings.drive_folder_id = targetFolderId;

      if (!store.secrets.gas_web_app_url) {
        res.status(400).json({ error: 'Enter your deployed Google Apps Script Web App URL first.' });
        return;
      }

      const result = await callGasBackend<{
        spreadsheetId: string;
        driveFolderId: string;
      }>('init', { drive_folder_id: targetFolderId });

      if (result) {
        store.settings.gas_spreadsheet_id = result.spreadsheetId || store.settings.gas_spreadsheet_id;
        store.settings.drive_folder_id = result.driveFolderId || targetFolderId;
        saveStore();
        appendLog(
          'ADMIN',
          'GAS_INIT_SUCCESS',
          'success',
          `Connected Google Sheets (${result.spreadsheetId}) and Drive folder (${store.settings.drive_folder_id}).`
        );
      }

      res.json({
        ok: true,
        message: 'Google Sheets & Google Drive test folder initialized successfully.',
        spreadsheet_id: store.settings.gas_spreadsheet_id,
        drive_folder_id: store.settings.drive_folder_id,
      });
    } catch (err) {
      appendLog(
        'ADMIN',
        'GAS_INIT_ERROR',
        'error',
        err instanceof Error ? err.message : 'GAS initialization failed'
      );
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to connect GAS Web App.' });
    }
  });

  app.delete('/api/admin/media/:mediaId', requireAdminAuth, async (req, res) => {
    const idx = store.media.findIndex((m) => m.media_id === req.params.mediaId);
    if (idx === -1) {
      res.status(404).json({ error: 'Media item not found.' });
      return;
    }
    const item = store.media[idx];
    const storedName = path.basename(item.public_url);
    try {
      const diskPath = getSafeUploadPath(storedName);
      if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    } catch {
      // ignore
    }
    store.media.splice(idx, 1);
    saveStore();
    appendLog('ADMIN', 'DELETE_MEDIA', 'success', `Deleted media file ${item.file_name}`);

    if (store.secrets.gas_web_app_url) {
      callGasBackend('deleteMedia', { media_id: item.media_id }).catch(() => {});
    }
    res.json({ ok: true });
  });

  app.post('/api/admin/media/purge-expired', requireAdminAuth, async (_req, res) => {
    const now = Date.now();
    const expiredSessionIds = new Set<string>();
    for (const s of store.sessions) {
      if (s.expires_at && new Date(s.expires_at).getTime() < now) {
        s.session_status = 'expired';
        expiredSessionIds.add(s.session_id);
      }
    }

    let deletedCount = 0;
    store.media = store.media.filter((m) => {
      const isExpired =
        expiredSessionIds.has(m.session_id) ||
        (m.expires_at && new Date(m.expires_at).getTime() < now);
      if (isExpired) {
        try {
          const diskPath = getSafeUploadPath(path.basename(m.public_url));
          if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
        } catch {
          // ignore
        }
        deletedCount++;
        return false;
      }
      return true;
    });

    saveStore();
    appendLog('ADMIN', 'PURGE_EXPIRED', 'success', `Purged ${deletedCount} expired media file(s).`);

    if (store.secrets.gas_web_app_url) {
      callGasBackend('purgeExpired', {}).catch(() => {});
    }
    res.json({ deletedCount });
  });

  app.get('/api/admin/gas-export', requireAdminAuth, (_req, res) => {
    const gasDir = path.resolve(process.cwd(), 'gas-project');
    const descriptions: Record<string, string> = {
      'Code.gs': 'All-in-one Google Apps Script backend (Sheets DB, Drive storage, QR download router, Welcome assets).',
      'Index.html': 'White & Burgundy GAS Web App UI matching the main Kiosk, Staff Station, Mobile Download, and Admin.',
      'README.md': 'Step-by-step Thai guide for deploying the 2-file GAS edition.',
    };

    const files: GasProjectFile[] = fs.existsSync(gasDir)
      ? fs.readdirSync(gasDir).sort().map((name) => ({
          name,
          path: `gas-project/${name}`,
          description: descriptions[name] || 'Google Apps Script project file',
          content: fs.readFileSync(path.join(gasDir, name), 'utf-8'),
        }))
      : [];

    const bridgePath = path.resolve(process.cwd(), 'bridge-agent', 'sony-bridge-server.mjs');
    const bridgeScript = fs.existsSync(bridgePath) ? fs.readFileSync(bridgePath, 'utf-8') : '';

    res.json({ files, bridgeScript });
  });

  // --- Parallel Staff AirDrop & File Manager Station Feed ---
  app.get('/api/station/feed', requireAdminAuth, (req, res) => {
    const sessionsWithMedia = store.sessions.slice(0, 60).map((s) => {
      const items = store.media.filter((m) => m.session_id === s.session_id);
      return {
        ...s,
        qr_url: s.qr_url || resolveQrDownloadUrl(req, s.download_token),
        media: items,
      };
    });
    res.json({
      booth_name: store.settings.booth_name,
      event_name: store.settings.event_name,
      gas_connected: Boolean(store.secrets.gas_web_app_url),
      sessions: sessionsWithMedia,
    });
  });

  // --- Admin Network / QR Accessibility Helper ---
  app.get('/api/admin/network-info', requireAdminAuth, (req, res) => {
    let sharedUrl = buildAppBaseUrl(req);
    if (sharedUrl.includes('ais-dev-')) {
      sharedUrl = sharedUrl.replace('ais-dev-', 'ais-pre-');
    }
    res.json({
      gas_connected: Boolean(store.secrets.gas_web_app_url),
      gas_web_app_url: store.secrets.gas_web_app_url ? 'Configured' : '',
      public_qr_base_url: store.settings.public_qr_base_url || '',
      shared_preview_url: sharedUrl,
      lan_urls: getLanUrls(),
    });
  });

  // --- Upload Decorative Welcome / Logo Image Asset ---
  app.post('/api/admin/upload-asset', requireAdminAuth, (req, res) => {
    try {
      const { fileName, dataUrl } = req.body as { fileName?: string; dataUrl?: string };
      if (!dataUrl || typeof dataUrl !== 'string') {
        res.status(400).json({ error: 'Image dataUrl is required.' });
        return;
      }
      const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
      if (!match) {
        res.status(400).json({ error: 'Only PNG, JPG, WEBP, or GIF images are supported.' });
        return;
      }
      const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
      const buf = Buffer.from(match[2], 'base64');
      if (buf.length > 12 * 1024 * 1024) {
        res.status(400).json({ error: 'Asset image must be smaller than 12MB.' });
        return;
      }
      const safeBase = path
        .basename(fileName || 'asset', path.extname(fileName || ''))
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .slice(0, 32);
      const outName = `asset_${safeBase || 'decor'}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const diskPath = getSafeUploadPath(outName);
      fs.writeFileSync(diskPath, buf);
      appendLog('ADMIN', 'UPLOAD_ASSET', 'success', `Uploaded decorative asset ${outName}`);
      res.json({ url: `/uploads/${outName}` });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Asset upload failed.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BoostBooth server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
