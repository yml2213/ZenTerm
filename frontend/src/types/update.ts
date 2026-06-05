// 更新相关类型定义

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  downloadSize?: number;
}

export interface UpdateProgress {
  downloaded: number;
  total: number;
  percent: number;
  speed: string;
}

export interface UpdateConfig {
  enabled: boolean;
  check_interval: number;
  last_check_time: number;
  skipped_version: string;
  auto_download: boolean;
  channel: string;
}
