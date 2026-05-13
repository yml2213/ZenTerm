import { main } from '../wailsjs/wailsjs/go/models'

export type WorkspaceType = 'vaults' | 'sftp' | 'new-tab' | 'log' | 'ssh'

export interface SessionTab {
  tabId: string
  sessionId?: string
  hostID?: string
  title: string
  remoteAddr?: string
  type: 'ssh' | 'new' | 'log'
}

export interface WorkspaceTab extends SessionTab {}

export interface HostKeyPrompt {
  hostID: string
  hostname: string
  port: number
  key: string
  fingerprint: string
}

export interface VaultSetupForm {
  password: string;
  confirmPassword: string;
  riskAcknowledged: boolean;
}

export interface ChangeMasterForm {
  currentPassword: string;
  nextPassword: string;
  confirmPassword: string;
}

export interface HostFormModel {
  id: string;
  name: string;
  address: string;
  port: string;
  username: string;
  group: string;
  tags: string;
  favorite: boolean;
  systemType: string;
  systemTypeSource: 'auto' | 'manual';
  authType: 'password' | 'key' | 'credential';
  password?: string;
  privateKey?: string;
  credentialId?: string;
}
