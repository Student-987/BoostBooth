export type ShootingMode = 'photo+gif' | 'photo' | 'gif';

export type CameraAdapterId = 'bridge-sony' | 'uvc-hdmi' | 'legacy-sony-wifi' | 'browser-webcam';

export type DrivePrivacyMode = 'anyone_with_link' | 'token_proxy';

export interface FrameSlot {
  id: string;
  label: string;
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  width: number; // percentage 0..100
  height: number; // percentage 0..100
  rotation?: number; // degrees
  fit?: 'cover' | 'contain';
}

export interface CanvaFrame {
  frame_id: string;
  frame_name: string;
  category: string;
  description: string;
  drive_file_id: string;
  preview_url: string;
  width: number;
  height: number;
  frame_layout: FrameSlot[];
  is_active: boolean;
  is_starter?: boolean;
  created_at: string;
}

export interface BoothSettings {
  booth_name: string;
  event_name: string;
  logo_url: string;
  welcome_headline: string;
  welcome_subtitle: string;
  welcome_cta_label: string;
  welcome_hero_images: string[];
  welcome_bg_url: string;
  drive_folder_id: string;
  retention_days: number;
  max_photos_per_session: number;
  default_countdown_sec: number;
  gif_burst_seconds: number;
  public_qr_base_url: string;
  system_status: 'active' | 'maintenance';
  camera_adapter: CameraAdapterId;
  bridge_url: string;
  preferred_video_device_id: string;
  privacy_mode: DrivePrivacyMode;
  auto_reset_seconds: number;
  gas_web_app_url_configured: boolean;
  gas_spreadsheet_id: string;
  gas_last_sync_at: string;
}

export interface AdminSettingsPayload extends BoothSettings {
  gas_web_app_url?: string;
  gas_api_secret?: string;
}

export interface BoothSession {
  session_id: string;
  created_at: string;
  selected_frame_id: string;
  selected_frame_name?: string;
  shooting_mode: ShootingMode;
  session_status: 'started' | 'capturing' | 'processing' | 'ready' | 'expired' | 'failed';
  drive_folder_id: string;
  download_token: string;
  qr_url: string;
  expires_at: string;
  media_count?: number;
}

export interface MediaItem {
  media_id: string;
  session_id: string;
  media_type: 'original' | 'framed' | 'gif';
  original_file_id: string;
  processed_file_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
  upload_status: 'uploaded' | 'synced_drive' | 'failed';
  public_url: string;
  drive_download_url?: string;
  upload_key?: string;
  expires_at?: string;
}

export interface SystemLog {
  log_id: string;
  timestamp: string;
  session_id: string;
  action: string;
  status: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface DashboardStats {
  total_sessions: number;
  total_photos: number;
  total_gifs: number;
  storage_used_bytes: number;
  active_frames: number;
  expired_files: number;
  gas_connected: boolean;
  gas_spreadsheet_id: string;
  drive_folder_id: string;
}

export interface GasProjectFile {
  name: string;
  path: string;
  description: string;
  content: string;
}
