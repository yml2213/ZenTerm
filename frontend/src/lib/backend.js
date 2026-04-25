const missingBackendMessage = '当前未检测到 Wails 后端，请通过 Wails 运行 ZenTerm。'

function getAppBinding() {
  return window.go?.main?.App
}

function getRuntimeBinding() {
  return window.runtime
}

export function isBackendAvailable() {
  return Boolean(getAppBinding())
}

async function callApp(method, ...args) {
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

export function onRuntimeEvent(eventName, handler) {
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

export async function unlock(password) {
  const binding = getAppBinding()
  if (typeof binding?.UnlockWithPreferences === 'function') {
    return binding.UnlockWithPreferences(password, false)
  }

  return callApp('Unlock', password)
}

export async function getVaultStatus() {
  return callApp('GetVaultStatus')
}

export async function getKeychainStatus() {
  return callApp('GetKeychainStatus')
}

export async function initializeVaultWithPreferences(password, remember) {
  return callApp('InitializeVaultWithPreferences', password, remember)
}

export async function unlockWithPreferences(password, remember) {
  const binding = getAppBinding()
  if (typeof binding?.UnlockWithPreferences === 'function') {
    return binding.UnlockWithPreferences(password, remember)
  }

  return callApp('Unlock', password)
}

export async function tryAutoUnlock() {
  const binding = getAppBinding()
  if (typeof binding?.TryAutoUnlock !== 'function') {
    return false
  }

  return binding.TryAutoUnlock()
}

export async function changeMasterPassword(currentPassword, nextPassword, remember) {
  return callApp('ChangeMasterPassword', currentPassword, nextPassword, remember)
}

export async function resetVault() {
  return callApp('ResetVault')
}

export async function listHosts() {
  return callApp('ListHosts')
}

export async function listLocalFiles(path = '') {
  return callApp('ListLocalFiles', path)
}

export async function listRemoteFiles(hostID, path = '') {
  return callApp('ListRemoteFiles', hostID, path)
}

export async function createLocalDirectory(parentPath, name) {
  return callApp('CreateLocalDirectory', parentPath, name)
}

export async function createRemoteDirectory(hostID, parentPath, name) {
  return callApp('CreateRemoteDirectory', hostID, parentPath, name)
}

export async function renameLocalEntry(path, nextName) {
  return callApp('RenameLocalEntry', path, nextName)
}

export async function renameRemoteEntry(hostID, path, nextName) {
  return callApp('RenameRemoteEntry', hostID, path, nextName)
}

export async function deleteLocalEntry(path) {
  return callApp('DeleteLocalEntry', path)
}

export async function deleteRemoteEntry(hostID, path) {
  return callApp('DeleteRemoteEntry', hostID, path)
}

export async function uploadFile(hostID, localPath, remoteDir, overwrite = false) {
  return callApp('UploadFile', hostID, localPath, remoteDir, overwrite)
}

export async function downloadFile(hostID, remotePath, localDir, overwrite = false) {
  return callApp('DownloadFile', hostID, remotePath, localDir, overwrite)
}

export async function addHost(host, identity) {
  return callApp('AddHost', host, identity)
}

export async function updateHost(host, identity) {
  return callApp('UpdateHost', host, identity)
}

export async function deleteHost(hostID) {
  return callApp('DeleteHost', hostID)
}

export async function connect(hostID) {
  return callApp('Connect', hostID)
}

export async function acceptHostKey(hostID, key) {
  return callApp('AcceptHostKey', hostID, key)
}

export async function rejectHostKey(hostID) {
  return callApp('RejectHostKey', hostID)
}

export async function sendInput(sessionID, data) {
  return callApp('SendInput', sessionID, data)
}

export async function resizeTerminal(sessionID, cols, rows) {
  return callApp('ResizeTerminal', sessionID, cols, rows)
}

export async function disconnect(sessionID) {
  return callApp('Disconnect', sessionID)
}

export async function listSessions() {
  return callApp('ListSessions')
}

export async function listSessionLogs(limit = 200) {
  return callApp('ListSessionLogs', limit)
}

export async function getSessionTranscript(logID) {
  return callApp('GetSessionTranscript', logID)
}

export async function toggleSessionLogFavorite(logID, favorite) {
  return callApp('ToggleSessionLogFavorite', logID, favorite)
}

export async function deleteSessionLog(logID) {
  return callApp('DeleteSessionLog', logID)
}

async function callRuntime(method, fallbackValue, ...args) {
  const runtime = getRuntimeBinding()
  const fn = runtime?.[method]
  if (typeof fn !== 'function') {
    return fallbackValue
  }

  return fn(...args)
}

export async function windowGetSize() {
  return callRuntime('WindowGetSize', { w: 0, h: 0 })
}

export async function windowIsMaximised() {
  return callRuntime('WindowIsMaximised', false)
}

export async function windowSetSize(width, height) {
  return callRuntime('WindowSetSize', undefined, width, height)
}

export async function windowSetBackgroundColour(red, green, blue, alpha = 255) {
  return callRuntime('WindowSetBackgroundColour', undefined, red, green, blue, alpha)
}

export async function windowMaximise() {
  return callRuntime('WindowMaximise', undefined)
}

export async function windowToggleMaximise() {
  return callRuntime('WindowToggleMaximise', undefined)
}

export async function persistWindowState() {
  return callApp('PersistWindowState')
}

export async function generateCredential(label, algorithm, keyBits, passphrase) {
  return callApp('GenerateCredential', label, algorithm, keyBits, passphrase)
}

export async function importCredential(label, privateKeyPEM, passphrase) {
  return callApp('ImportCredential', label, privateKeyPEM, passphrase)
}

export async function getCredentials() {
  return callApp('GetCredentials')
}

export async function getCredential(credentialID) {
  return callApp('GetCredential', credentialID)
}

export async function getCredentialUsage(credentialID) {
  return callApp('GetCredentialUsage', credentialID)
}

export async function deleteCredential(credentialID) {
  return callApp('DeleteCredential', credentialID)
}
