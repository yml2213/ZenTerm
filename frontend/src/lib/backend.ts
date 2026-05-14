import { main, model } from '../wailsjs/wailsjs/go/models'

declare global {
  interface Window {
    go: {
      main: {
        App: any
      }
    }
    runtime: any
  }
}

const missingBackendMessage = '当前未检测到 Wails 后端，请通过 Wails 运行 ZenTerm。'

function getAppBinding(): any {
  return window.go?.main?.App
}

function getRuntimeBinding(): any {
  return window.runtime
}

export function isBackendAvailable(): boolean {
  return Boolean(getAppBinding())
}

async function callApp(method: string, ...args: any[]): Promise<any> {
  const binding = getAppBinding()
  const fn = binding?.[method]

  if (typeof fn !== 'function') {
    if (method === 'ListHosts' || method === 'ListSessions' || method === 'ListSessionLogs') {
      return []
    }
    if (method === 'GetSessionTranscript') {
      return { content: '' }
    }

    throw new Error(missingBackendMessage)
  }

  return fn(...args)
}

export function onRuntimeEvent(eventName: string, handler: (...args: any[]) => void): () => void {
  const runtime = getRuntimeBinding()
  const on = runtime?.EventsOn
  const off = runtime?.EventsOff

  if (typeof on !== 'function') {
    return () => {}
  }

  const unsubscribe = on(eventName, handler)
  if (typeof unsubscribe === 'function') {
    return unsubscribe
  }

  return () => {
    if (typeof off === 'function') {
      off(eventName)
    }
  }
}

export async function unlock(password: string): Promise<model.VaultStatus> {
  const binding = getAppBinding()
  if (typeof binding?.UnlockWithPreferences === 'function') {
    return binding.UnlockWithPreferences(password, false)
  }

  return callApp('Unlock', password)
}

export async function getVaultStatus(): Promise<model.VaultStatus> {
  return callApp('GetVaultStatus')
}

export async function getKeychainStatus(): Promise<model.KeychainStatus> {
  return callApp('GetKeychainStatus')
}

export async function initializeVaultWithPreferences(password: string, remember: boolean): Promise<model.VaultStatus> {
  return callApp('InitializeVaultWithPreferences', password, remember)
}

export async function unlockWithPreferences(password: string, remember: boolean): Promise<model.VaultStatus> {
  const binding = getAppBinding()
  if (typeof binding?.UnlockWithPreferences === 'function') {
    return binding.UnlockWithPreferences(password, remember)
  }

  return callApp('Unlock', password)
}

export async function tryAutoUnlock(): Promise<boolean> {
  const binding = getAppBinding()
  if (typeof binding?.TryAutoUnlock !== 'function') {
    return false
  }

  return binding.TryAutoUnlock()
}

export async function changeMasterPassword(currentPassword: string, nextPassword: string, remember: boolean): Promise<model.VaultStatus> {
  return callApp('ChangeMasterPassword', currentPassword, nextPassword, remember)
}

export async function resetVault(): Promise<void> {
  return callApp('ResetVault')
}

export async function listHosts(): Promise<main.Host[]> {
  return callApp('ListHosts')
}

export async function listLocalFiles(path: string = ''): Promise<main.FileListing> {
  return callApp('ListLocalFiles', path)
}

export async function listRemoteFiles(hostID: string, path: string = ''): Promise<main.FileListing> {
  return callApp('ListRemoteFiles', hostID, path)
}

export async function createLocalDirectory(parentPath: string, name: string): Promise<void> {
  return callApp('CreateLocalDirectory', parentPath, name)
}

export async function createRemoteDirectory(hostID: string, parentPath: string, name: string): Promise<void> {
  return callApp('CreateRemoteDirectory', hostID, parentPath, name)
}

export async function renameLocalEntry(path: string, nextName: string): Promise<void> {
  return callApp('RenameLocalEntry', path, nextName)
}

export async function renameRemoteEntry(hostID: string, path: string, nextName: string): Promise<void> {
  return callApp('RenameRemoteEntry', hostID, path, nextName)
}

export async function deleteLocalEntry(path: string): Promise<void> {
  return callApp('DeleteLocalEntry', path)
}

export async function deleteRemoteEntry(hostID: string, path: string): Promise<void> {
  return callApp('DeleteRemoteEntry', hostID, path)
}

export async function uploadFile(hostID: string, localPath: string, remoteDir: string, overwrite: boolean = false): Promise<model.FileTransferResult> {
  return callApp('UploadFile', hostID, localPath, remoteDir, overwrite)
}

export async function downloadFile(hostID: string, remotePath: string, localDir: string, overwrite: boolean = false): Promise<model.FileTransferResult> {
  return callApp('DownloadFile', hostID, remotePath, localDir, overwrite)
}

export async function addHost(host: main.Host, identity: model.Identity): Promise<string> {
  return callApp('AddHost', host, identity)
}

export async function updateHost(host: main.Host, identity: model.Identity): Promise<void> {
  return callApp('UpdateHost', host, identity)
}

export async function deleteHost(hostID: string): Promise<void> {
  return callApp('DeleteHost', hostID)
}

export async function connect(hostID: string): Promise<string> {
  return callApp('Connect', hostID)
}

export async function acceptHostKey(hostID: string, key: string): Promise<void> {
  return callApp('AcceptHostKey', hostID, key)
}

export async function rejectHostKey(hostID: string): Promise<void> {
  return callApp('RejectHostKey', hostID)
}

export async function sendInput(sessionID: string, data: string): Promise<void> {
  return callApp('SendInput', sessionID, data)
}

export async function resizeTerminal(sessionID: string, cols: number, rows: number): Promise<void> {
  return callApp('ResizeTerminal', sessionID, cols, rows)
}

export async function disconnect(sessionID: string): Promise<void> {
  return callApp('Disconnect', sessionID)
}

export async function listSessions(): Promise<main.Session[]> {
  return callApp('ListSessions')
}

export async function listSessionLogs(limit: number = 200): Promise<main.SessionLog[]> {
  return callApp('ListSessionLogs', limit)
}

export async function getSessionTranscript(logID: string): Promise<main.SessionTranscript> {
  return callApp('GetSessionTranscript', logID)
}

export async function toggleSessionLogFavorite(logID: string, favorite: boolean): Promise<void> {
  return callApp('ToggleSessionLogFavorite', logID, favorite)
}

export async function deleteSessionLog(logID: string): Promise<void> {
  return callApp('DeleteSessionLog', logID)
}

async function callRuntime(method: string, fallbackValue: any, ...args: any[]): Promise<any> {
  const runtime = getRuntimeBinding()
  const fn = runtime?.[method]
  if (typeof fn !== 'function') {
    return fallbackValue
  }

  return fn(...args)
}

export async function windowGetSize(): Promise<{ w: number; h: number }> {
  return callRuntime('WindowGetSize', { w: 0, h: 0 })
}

export async function windowIsMaximised(): Promise<boolean> {
  return callRuntime('WindowIsMaximised', false)
}

export async function windowSetSize(width: number, height: number): Promise<void> {
  return callRuntime('WindowSetSize', undefined, width, height)
}

export async function windowSetBackgroundColour(red: number, green: number, blue: number, alpha: number = 255): Promise<void> {
  return callRuntime('WindowSetBackgroundColour', undefined, red, green, blue, alpha)
}

export async function windowMaximise(): Promise<void> {
  return callRuntime('WindowMaximise', undefined)
}

export async function windowToggleMaximise(): Promise<void> {
  return callRuntime('WindowToggleMaximise', undefined)
}

export async function persistWindowState(): Promise<void> {
  return callApp('PersistWindowState')
}

export async function generateCredential(label: string, algorithm: string, keyBits: number, passphrase: string): Promise<main.Credential> {
  return callApp('GenerateCredential', label, algorithm, keyBits, passphrase)
}

export async function importCredential(label: string, privateKeyPEM: string, passphrase: string): Promise<main.Credential> {
  return callApp('ImportCredential', label, privateKeyPEM, passphrase)
}

export async function getCredentials(): Promise<main.Credential[]> {
  return callApp('GetCredentials')
}

export async function getCredential(credentialID: string): Promise<main.Credential> {
  return callApp('GetCredential', credentialID)
}

export async function getCredentialUsage(credentialID: string): Promise<model.CredentialUsage> {
  return callApp('GetCredentialUsage', credentialID)
}

export async function deleteCredential(credentialID: string): Promise<void> {
  return callApp('DeleteCredential', credentialID)
}
