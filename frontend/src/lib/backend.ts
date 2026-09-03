import { cmd, model } from './backendModels'
import type { UpdateConfig, UpdateInfo } from '../types/update'

type BackendMethod = (...args: unknown[]) => unknown;
type AppBinding = Record<string, BackendMethod | undefined>;
type RuntimeMethod = (...args: unknown[]) => unknown;

interface RuntimeBinding {
  EventsOn?: (
    eventName: string,
    handler: (...args: unknown[]) => void
  ) => unknown;
  EventsOff?: (eventName: string) => void;
  BrowserOpenURL?: (url: string) => void;
  ClipboardGetText?: () => Promise<string> | string;
  ClipboardSetText?: (text: string) => Promise<boolean> | boolean;
}

declare global {
  interface Window {
    go?: {
      cmd: {
        App?: AppBinding
      }
    }
    runtime?: RuntimeBinding
  }
}

const missingBackendMessage =
  "当前未检测到 Wails 后端，请通过 Wails 运行 ZenTerm。";

function getAppBinding(): AppBinding | undefined {
  return window.go?.cmd?.App
}

function getRuntimeBinding(): RuntimeBinding | undefined {
  return window.runtime;
}

export function isBackendAvailable(): boolean {
  return Boolean(getAppBinding());
}

async function callApp<T>(method: string, ...args: unknown[]): Promise<T> {
  const binding = getAppBinding();
  const fn = binding?.[method];

  if (typeof fn !== "function") {
    if (
      method === "ListHosts" ||
      method === "ListSessions" ||
      method === "ListSessionLogs"
    ) {
      return [] as T;
    }
    if (method === "GetSessionTranscript") {
      return { content: "" } as T;
    }

    throw new Error(missingBackendMessage);
  }

  return fn(...args) as T;
}

export function onRuntimeEvent(
  eventName: string,
  handler: (...args: unknown[]) => void
): () => void {
  const runtime = getRuntimeBinding();
  const on = runtime?.EventsOn;
  const off = runtime?.EventsOff;

  if (typeof on !== "function") {
    return () => {};
  }

  const unsubscribe = on(eventName, handler);
  if (typeof unsubscribe === "function") {
    return () => {
      unsubscribe();
    };
  }

  return () => {
    if (typeof off === "function") {
      off(eventName);
    }
  };
}

export async function readClipboardText(): Promise<string> {
  const runtime = getRuntimeBinding();
  const runtimeRead = runtime?.ClipboardGetText;

  if (typeof runtimeRead === "function") {
    try {
      return String(await runtimeRead());
    } catch {
      // Wails 不可用时回退到 Web Clipboard API。
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }

  return "";
}

export async function writeClipboardText(text: string): Promise<boolean> {
  const runtime = getRuntimeBinding();
  const runtimeWrite = runtime?.ClipboardSetText;

  if (typeof runtimeWrite === "function") {
    try {
      if (await runtimeWrite(text)) {
        return true;
      }
    } catch {
      // Wails 不可用时回退到 Web Clipboard API。
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  return false;
}

export async function unlock(password: string): Promise<void> {
  const binding = getAppBinding();
  if (typeof binding?.UnlockWithPreferences === "function") {
    await binding.UnlockWithPreferences(password, false);
    return;
  }

  return callApp("Unlock", password);
}

export async function getVaultStatus(): Promise<model.VaultStatus> {
  return callApp("GetVaultStatus");
}

export async function getKeychainStatus(): Promise<model.KeychainStatus> {
  return callApp("GetKeychainStatus");
}

export async function initializeVaultWithPreferences(
  password: string,
  remember: boolean
): Promise<void> {
  return callApp("InitializeVaultWithPreferences", password, remember);
}

export async function unlockWithPreferences(
  password: string,
  remember: boolean
): Promise<void> {
  const binding = getAppBinding();
  if (typeof binding?.UnlockWithPreferences === "function") {
    await binding.UnlockWithPreferences(password, remember);
    return;
  }

  return callApp("Unlock", password);
}

export async function tryAutoUnlock(): Promise<boolean> {
  const binding = getAppBinding();
  if (typeof binding?.TryAutoUnlock !== "function") {
    return false;
  }

  return binding.TryAutoUnlock() as boolean;
}

export async function changeMasterPassword(
  currentPassword: string,
  nextPassword: string,
  remember: boolean
): Promise<void> {
  return callApp(
    "ChangeMasterPassword",
    currentPassword,
    nextPassword,
    remember
  );
}

export async function resetVault(): Promise<void> {
  return callApp("ResetVault");
}

export async function listHosts(): Promise<cmd.Host[]> {
  return callApp('ListHosts')
}

export async function listLocalFiles(path: string = ''): Promise<cmd.FileListing> {
  return callApp('ListLocalFiles', path)
}

export async function listRemoteFiles(hostID: string, path: string = ''): Promise<cmd.FileListing> {
  return callApp('ListRemoteFiles', hostID, path)
}

export async function uploadDirectory(
  hostID: string,
  localPath: string,
  remoteDir: string,
  autoCompress: boolean,
  overwrite: boolean = false,
  transferId: string = ''
): Promise<model.FileTransferResult> {
  return callApp('UploadDirectory', hostID, localPath, remoteDir, autoCompress, overwrite, transferId)
}

export async function extractLocalArchive(archivePath: string, targetDir: string): Promise<void> {
  return callApp('ExtractLocalArchive', archivePath, targetDir)
}

export async function extractRemoteArchive(
  hostID: string,
  archivePath: string,
  targetDir: string
): Promise<void> {
  return callApp('ExtractRemoteArchive', hostID, archivePath, targetDir)
}

export async function compressLocalEntry(sourcePath: string, targetArchivePath: string): Promise<void> {
  return callApp('CompressLocalEntry', sourcePath, targetArchivePath)
}

export async function compressRemoteEntry(
  hostID: string,
  sourcePath: string,
  targetArchivePath: string
): Promise<void> {
  return callApp('CompressRemoteEntry', hostID, sourcePath, targetArchivePath)
}

export async function createLocalDirectory(
  parentPath: string,
  name: string
): Promise<void> {
  return callApp("CreateLocalDirectory", parentPath, name);
}

export async function createRemoteDirectory(
  hostID: string,
  parentPath: string,
  name: string
): Promise<void> {
  return callApp("CreateRemoteDirectory", hostID, parentPath, name);
}

export async function renameLocalEntry(
  path: string,
  nextName: string
): Promise<void> {
  return callApp("RenameLocalEntry", path, nextName);
}

export async function renameRemoteEntry(
  hostID: string,
  path: string,
  nextName: string
): Promise<void> {
  return callApp("RenameRemoteEntry", hostID, path, nextName);
}

export async function deleteLocalEntry(path: string): Promise<void> {
  return callApp("DeleteLocalEntry", path);
}

export async function deleteRemoteEntry(
  hostID: string,
  path: string
): Promise<void> {
  return callApp("DeleteRemoteEntry", hostID, path);
}

export async function chmodLocalEntry(
  path: string,
  mode: string
): Promise<void> {
  return callApp("ChmodLocalEntry", path, mode);
}

export async function chmodRemoteEntry(
  hostID: string,
  path: string,
  mode: string
): Promise<void> {
  return callApp("ChmodRemoteEntry", hostID, path, mode);
}

export async function uploadFile(
  hostID: string,
  localPath: string,
  remoteDir: string,
  overwrite: boolean = false,
  transferId: string = ''
): Promise<model.FileTransferResult> {
  return callApp("UploadFile", hostID, localPath, remoteDir, overwrite, transferId);
}

export async function downloadFile(
  hostID: string,
  remotePath: string,
  localDir: string,
  overwrite: boolean = false,
  transferId: string = ''
): Promise<model.FileTransferResult> {
  return callApp("DownloadFile", hostID, remotePath, localDir, overwrite, transferId);
}

export async function cancelFileTransfer(hostID: string): Promise<void> {
  return callApp('CancelFileTransfer', hostID)
}

export async function addHost(host: cmd.Host, identity: model.Identity): Promise<string> {
  return callApp('AddHost', host, identity)
}

export async function updateHost(host: cmd.Host, identity: model.Identity): Promise<void> {
  return callApp('UpdateHost', host, identity)
}

export async function updateHostPinned(
  hostID: string,
  pinned: boolean
): Promise<void> {
  return callApp("UpdateHostPinned", hostID, pinned);
}

export async function reorderHosts(hostIDs: string[]): Promise<void> {
  return callApp("ReorderHosts", hostIDs);
}

export async function deleteHost(hostID: string): Promise<void> {
  return callApp("DeleteHost", hostID);
}

export async function getHostSecret(hostID: string): Promise<cmd.HostSecret> {
  return callApp('GetHostSecret', hostID)
}

export async function connect(hostID: string): Promise<string> {
  return callApp("Connect", hostID);
}

export async function cancelConnect(hostID: string): Promise<void> {
  return callApp('CancelConnect', hostID)
}

export async function acceptHostKey(
  hostID: string,
  key: string
): Promise<void> {
  return callApp("AcceptHostKey", hostID, key);
}

export async function rejectHostKey(hostID: string): Promise<void> {
  return callApp("RejectHostKey", hostID);
}

export async function sendInput(
  sessionID: string,
  data: string
): Promise<void> {
  return callApp("SendInput", sessionID, data);
}

export async function resizeTerminal(
  sessionID: string,
  cols: number,
  rows: number
): Promise<void> {
  return callApp("ResizeTerminal", sessionID, cols, rows);
}

export async function disconnect(sessionID: string): Promise<void> {
  return callApp("Disconnect", sessionID);
}

export async function listSessions(): Promise<cmd.Session[]> {
  return callApp('ListSessions')
}

export async function listSessionLogs(limit: number = 200): Promise<cmd.SessionLog[]> {
  return callApp('ListSessionLogs', limit)
}

export async function getSessionTranscript(logID: string): Promise<cmd.SessionTranscript> {
  return callApp('GetSessionTranscript', logID)
}

export async function toggleSessionLogFavorite(
  logID: string,
  favorite: boolean
): Promise<void> {
  return callApp("ToggleSessionLogFavorite", logID, favorite);
}

export async function deleteSessionLog(logID: string): Promise<void> {
  return callApp("DeleteSessionLog", logID);
}

export async function clearSessionLogs(): Promise<void> {
  return callApp("ClearSessionLogs");
}

export async function getAppVersion(): Promise<string> {
  return callApp("GetAppVersion");
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  return callApp("CheckForUpdates");
}

export async function getUpdateConfig(): Promise<UpdateConfig> {
  return callApp("GetUpdateConfig");
}

export async function saveUpdateConfig(config: UpdateConfig): Promise<void> {
  return callApp("SaveUpdateConfig", config);
}

export async function downloadUpdate(downloadURL: string): Promise<void> {
  return callApp("DownloadUpdate", downloadURL);
}

export async function skipVersion(version: string): Promise<void> {
  return callApp("SkipVersion", version);
}

export async function openUpdateFile(filePath: string): Promise<void> {
  return callApp("OpenUpdateFile", filePath);
}

async function callRuntime<T>(
  method: string,
  fallbackValue: T,
  ...args: unknown[]
): Promise<T> {
  const runtime = getRuntimeBinding();
  const fn = runtime
    ? (runtime as Record<string, RuntimeMethod | undefined>)[method]
    : undefined;
  if (typeof fn !== "function") {
    return fallbackValue;
  }

  return fn(...args) as T;
}

export async function browserOpenURL(url: string): Promise<void> {
  return callRuntime("BrowserOpenURL", undefined, url);
}

export async function windowGetSize(): Promise<{ w: number; h: number }> {
  return callRuntime("WindowGetSize", { w: 0, h: 0 });
}

export async function windowIsMaximised(): Promise<boolean> {
  return callRuntime("WindowIsMaximised", false);
}

export async function windowSetSize(
  width: number,
  height: number
): Promise<void> {
  return callRuntime("WindowSetSize", undefined, width, height);
}

export async function windowSetBackgroundColour(
  red: number,
  green: number,
  blue: number,
  alpha: number = 255
): Promise<void> {
  return callRuntime(
    "WindowSetBackgroundColour",
    undefined,
    red,
    green,
    blue,
    alpha
  );
}

export async function windowSetSystemDefaultTheme(): Promise<void> {
  return callRuntime("WindowSetSystemDefaultTheme", undefined);
}

export async function windowSetLightTheme(): Promise<void> {
  return callRuntime("WindowSetLightTheme", undefined);
}

export async function windowSetDarkTheme(): Promise<void> {
  return callRuntime("WindowSetDarkTheme", undefined);
}

export async function windowMaximise(): Promise<void> {
  return callRuntime("WindowMaximise", undefined);
}

export async function windowToggleMaximise(): Promise<void> {
  return callRuntime("WindowToggleMaximise", undefined);
}

export async function persistWindowState(): Promise<void> {
  return callApp("PersistWindowState");
}

export interface WebDAVSyncConfig {
  url: string;
  username: string;
  remote_path?: string;
  device_name?: string;
  password?: string;
}

export interface WebDAVSyncStatus {
  configured: boolean;
  provider?: string;
  device_id?: string;
  device_name?: string;
  url?: string;
  username?: string;
  remote_path?: string;
  last_remote_etag?: string;
  last_snapshot_hash?: string;
  last_sync_at?: string;
  updated_at?: string;
}

export interface WebDAVSyncResult {
  direction: "push" | "pull";
  remote_etag?: string;
  bytes: number;
  conflict?: boolean;
  message?: string;
  synced_at?: string;
}

export interface WebDAVSyncTestResult {
  ok: boolean;
  exists: boolean;
  remote_etag?: string;
  message?: string;
}

export async function configureWebDAVSync(
  config: WebDAVSyncConfig
): Promise<WebDAVSyncStatus> {
  return callApp("ConfigureWebDAVSync", config);
}

export async function getWebDAVSyncStatus(): Promise<WebDAVSyncStatus> {
  return callApp("GetWebDAVSyncStatus");
}

export async function testWebDAVSync(
  config: WebDAVSyncConfig
): Promise<WebDAVSyncTestResult> {
  return callApp("TestWebDAVSync", config);
}

export async function cancelWebDAVSync(): Promise<void> {
  return callApp('CancelWebDAVSync')
}

export async function pushWebDAVSync(
  overwrite: boolean = false
): Promise<WebDAVSyncResult> {
  return callApp("PushWebDAVSync", overwrite);
}

export async function pullWebDAVSync(
  masterPassword: string,
  overwrite: boolean = false
): Promise<WebDAVSyncResult> {
  return callApp("PullWebDAVSync", masterPassword, overwrite);
}

export async function generateCredential(
  label: string,
  algorithm: string,
  keyBits: number,
  passphrase: string
): Promise<string> {
  return callApp("GenerateCredential", label, algorithm, keyBits, passphrase);
}

export async function importCredential(
  label: string,
  privateKeyPEM: string,
  passphrase: string
): Promise<string> {
  return callApp("ImportCredential", label, privateKeyPEM, passphrase);
}

export async function getCredentials(): Promise<cmd.Credential[]> {
  return callApp('GetCredentials')
}

export async function getCredential(credentialID: string): Promise<cmd.Credential> {
  return callApp('GetCredential', credentialID)
}

export async function getCredentialUsage(
  credentialID: string
): Promise<model.CredentialUsage> {
  return callApp("GetCredentialUsage", credentialID);
}

export async function getCredentialPublicKey(
  credentialID: string
): Promise<string> {
  return callApp("GetCredentialPublicKey", credentialID);
}

export async function getCredentialSecret(credentialID: string): Promise<cmd.CredentialSecret> {
  return callApp('GetCredentialSecret', credentialID)
}

export interface LocalSSHKey {
  id: string;
  name: string;
  path: string;
  public_path?: string;
  algorithm?: string;
  public_key?: string;
  fingerprint_sha256?: string;
  has_private: boolean;
  encrypted: boolean;
  imported: boolean;
  credential_id?: string;
}

export async function listLocalSSHKeys(): Promise<LocalSSHKey[]> {
  return callApp("ListLocalSSHKeys");
}

export async function importLocalSSHKey(
  path: string,
  label: string,
  passphrase: string
): Promise<string> {
  return callApp("ImportLocalSSHKey", path, label, passphrase);
}

export interface LocalSSHConfigHost {
  id: string;
  alias: string;
  host_name: string;
  user?: string;
  port?: number;
  identity_file?: string;
  credential_id?: string;
  imported: boolean;
}

export async function listLocalSSHConfigHosts(): Promise<LocalSSHConfigHost[]> {
  return callApp("ListLocalSSHConfigHosts");
}

export async function importLocalSSHConfigHosts(ids: string[]): Promise<cmd.Host[]> {
  return callApp('ImportLocalSSHConfigHosts', ids)
}

export interface CredentialUploadResult {
  host_id: string;
  credential_id: string;
  uploaded: boolean;
  already_there: boolean;
  bound: boolean;
  message?: string;
}

export async function uploadCredentialToHost(
  hostID: string,
  credentialID: string,
  bind: boolean
): Promise<CredentialUploadResult> {
  return callApp("UploadCredentialToHost", hostID, credentialID, bind);
}

export async function bindCredentialToHost(
  hostID: string,
  credentialID: string
): Promise<void> {
  return callApp("BindCredentialToHost", hostID, credentialID);
}

export async function testCredentialForHost(
  hostID: string,
  credentialID: string
): Promise<void> {
  return callApp("TestCredentialForHost", hostID, credentialID);
}
export async function deleteCredential(credentialID: string): Promise<void> {
  return callApp("DeleteCredential", credentialID);
}

// ─── Data Management ─────────────────────────────────────────────────────────

export interface DataStats {
  store_path: string;
  file_size: number;
  host_count: number;
  credential_count: number;
  session_log_count: number;
  transcript_bytes: number;
  modified_at: string;
}

export interface BackupEntry {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export async function getDataStats(): Promise<DataStats> {
  return callApp("GetDataStats");
}

export async function exportData(): Promise<string> {
  return callApp("ExportData");
}

export async function exportDataToPath(targetPath: string): Promise<void> {
  return callApp("ExportDataToPath", targetPath);
}

export async function importData(masterPassword: string): Promise<string> {
  return callApp("ImportData", masterPassword);
}

export async function importDataFromPath(
  filePath: string,
  masterPassword: string
): Promise<void> {
  return callApp("ImportDataFromPath", filePath, masterPassword);
}

export async function listBackups(): Promise<BackupEntry[]> {
  return callApp("ListBackups");
}

export async function deleteBackup(backupPath: string): Promise<void> {
  return callApp("DeleteBackup", backupPath);
}

export async function restoreBackup(
  backupPath: string,
  masterPassword: string
): Promise<void> {
  return callApp("RestoreBackup", backupPath, masterPassword);
}
export async function openStoreDirectory(): Promise<void> {
  return callApp("OpenStoreDirectory");
}

// ─── App Preferences ───────────────────────────────────────────────────────

export interface AppPreferences {
  open_inspector_on_startup?: boolean;
  record_session_transcripts?: boolean;
  session_log_retention_limit?: number;
}

export async function getAppPreferences(): Promise<AppPreferences> {
  return callApp("GetAppPreferences");
}

export async function saveAppPreferences(prefs: AppPreferences): Promise<void> {
  return callApp("SaveAppPreferences", prefs);
}
