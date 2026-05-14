import { beforeEach, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import ThemeProvider from '../contexts/ThemeProvider.jsx'
import LanguageProvider from '../contexts/LanguageProvider.jsx'
import App from '../App.jsx'
import {
  acceptHostKey,
  addHost,
  changeMasterPassword,
  connect,
  createLocalDirectory,
  createRemoteDirectory,
  deleteCredential,
  deleteHost,
  deleteLocalEntry,
  deleteRemoteEntry,
  disconnect,
  downloadFile,
  generateCredential,
  getCredentials,
  getCredentialUsage,
  getSessionTranscript,
  getKeychainStatus,
  getVaultStatus,
  importCredential,
  initializeVaultWithPreferences,
  listHosts,
  listLocalFiles,
  listRemoteFiles,
  listSessionLogs,
  listSessions,
  onRuntimeEvent,
  persistWindowState,
  renameLocalEntry,
  renameRemoteEntry,
  resetVault,
  resizeTerminal,
  sendInput,
  toggleSessionLogFavorite,
  tryAutoUnlock,
  unlockWithPreferences,
  updateHost,
  uploadFile,
  windowSetBackgroundColour,
  windowToggleMaximise,
} from '../lib/backend.js'

vi.mock('../lib/backend.js', () => ({
  listHosts: vi.fn(),
  addHost: vi.fn(),
  updateHost: vi.fn(),
  deleteHost: vi.fn(),
  getKeychainStatus: vi.fn(),
  getVaultStatus: vi.fn(),
  initializeVaultWithPreferences: vi.fn(),
  unlock: vi.fn(),
  unlockWithPreferences: vi.fn(),
  tryAutoUnlock: vi.fn(),
  changeMasterPassword: vi.fn(),
  resetVault: vi.fn(),
  connect: vi.fn(),
  createLocalDirectory: vi.fn(),
  createRemoteDirectory: vi.fn(),
  downloadFile: vi.fn(),
  disconnect: vi.fn(),
  deleteLocalEntry: vi.fn(),
  deleteRemoteEntry: vi.fn(),
  generateCredential: vi.fn(),
  importCredential: vi.fn(),
  getCredentials: vi.fn(),
  getCredentialUsage: vi.fn(),
  getSessionTranscript: vi.fn(),
  deleteCredential: vi.fn(),
  listLocalFiles: vi.fn(),
  listRemoteFiles: vi.fn(),
  listSessionLogs: vi.fn(),
  listSessions: vi.fn(),
  acceptHostKey: vi.fn(),
  rejectHostKey: vi.fn(),
  renameLocalEntry: vi.fn(),
  renameRemoteEntry: vi.fn(),
  sendInput: vi.fn(),
  toggleSessionLogFavorite: vi.fn(),
  resizeTerminal: vi.fn(),
  onRuntimeEvent: vi.fn(),
  persistWindowState: vi.fn(),
  uploadFile: vi.fn(),
  windowSetBackgroundColour: vi.fn(),
  windowToggleMaximise: vi.fn(),
}))

vi.mock('../components/TerminalPane.jsx', () => ({
  default: function MockTerminalPane({
    sessions,
    activeSessionId,
    activeSessionTitle,
    activeSessionMeta,
    onSendInput,
    onResize,
    onSessionClosed,
  }) {
    return (
      <section data-testid="terminal-pane">
        <h2>{activeSessionTitle}</h2>
        <p>{activeSessionMeta?.remoteAddr || '当前没有活跃终端，连接主机后会在这里显示 shell。'}</p>
        <span>tabs:{sessions.length}</span>
        <span>active:{activeSessionId || 'none'}</span>
        <button type="button" onClick={() => onSendInput(activeSessionId, 'pwd\n')}>
          发送终端输入
        </button>
        <button type="button" onClick={() => onResize(activeSessionId, 120, 36)}>
          调整终端尺寸
        </button>
        <button type="button" onClick={() => onSessionClosed(activeSessionId)}>
          模拟会话关闭
        </button>
      </section>
    )
  },
}))

vi.mock('../components/LogWorkspace.jsx', () => ({
  default: function MockLogWorkspace({
    activeLogTab,
    onCloseLog,
  }) {
    return (
      <section data-testid="log-workspace">
        <h2>{activeLogTab?.title || '日志'}</h2>
        <p>{activeLogTab?.remoteAddr || '未知地址'}</p>
        <button type="button" onClick={onCloseLog}>关闭日志标签页</button>
      </section>
    )
  },
}))

export const runtimeHandlers = new Map()

export const hosts = [
  {
    id: 'host-1',
    name: 'Alpha',
    address: '10.0.0.1',
    port: 22,
    username: 'root',
    group: '生产环境',
    tags: 'Linux, DB',
    favorite: true,
    last_connected_at: '2026-04-23T10:20:00Z',
    known_hosts: '',
  },
  {
    id: 'host-2',
    name: 'Beta',
    address: '10.0.0.2',
    port: 2222,
    username: 'deploy',
    group: '测试环境',
    tags: 'GPU',
    known_hosts: 'ssh-ed25519 AAAA',
  },
]

export function createDeferred() {
  let resolve
  let reject

  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

export function renderApp() {
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ThemeProvider>,
  )
}

export async function continueWithMasterPassword(user) {
  const passwordInput = await screen.findByLabelText('主密码')
  await user.type(passwordInput, 'master-password')
  await user.click(screen.getByRole('button', { name: '继续' }))
  await waitFor(() => expect(unlockWithPreferences).toHaveBeenCalledWith('master-password', true))
}

export async function initializeVault(user) {
  await user.type(await screen.findByLabelText('主密码'), 'master-password')
  await user.type(screen.getByLabelText('确认主密码'), 'master-password')
  await user.click(screen.getByLabelText(/我已了解忘记主密码后无法恢复/))
  await user.click(screen.getByRole('button', { name: '创建并进入' }))
  await waitFor(() => expect(initializeVaultWithPreferences).toHaveBeenCalledWith('master-password', true))
}

export function registerAppHarness() {
  beforeEach(() => {
    vi.clearAllMocks()
    runtimeHandlers.clear()
    localStorage.clear()

    listHosts.mockResolvedValue(hosts)
    listSessions.mockResolvedValue([])
    addHost.mockResolvedValue(undefined)
    updateHost.mockResolvedValue(undefined)
    deleteHost.mockResolvedValue(undefined)
    getKeychainStatus.mockResolvedValue({
      supported: true,
      saved: true,
      provider: 'macOS 钥匙串',
      message: '系统钥匙串可用，且已经保存主密码。',
    })
    getVaultStatus.mockResolvedValue({ initialized: true, unlocked: false })
    initializeVaultWithPreferences.mockResolvedValue(undefined)
    unlockWithPreferences.mockResolvedValue(undefined)
    tryAutoUnlock.mockResolvedValue(false)
    changeMasterPassword.mockResolvedValue(undefined)
    resetVault.mockResolvedValue(undefined)
    connect.mockResolvedValue('session-1')
    createLocalDirectory.mockResolvedValue(undefined)
    createRemoteDirectory.mockResolvedValue(undefined)
    downloadFile.mockResolvedValue({
      sourcePath: '/home/root/app.log',
      targetPath: '/Users/yml/app.log',
      bytesCopied: 128,
    })
    disconnect.mockResolvedValue(undefined)
    deleteLocalEntry.mockResolvedValue(undefined)
    deleteRemoteEntry.mockResolvedValue(undefined)
    generateCredential.mockResolvedValue('cred-1')
    importCredential.mockResolvedValue('cred-2')
    getCredentials.mockResolvedValue([])
    getCredentialUsage.mockResolvedValue({
      credential_id: 'cred-1',
      host_ids: [],
      active_sessions: 0,
    })
    getSessionTranscript.mockResolvedValue({
      log_id: 'log-2',
      session_id: 'session-closed',
      content: 'Connected: Beta\r\n$ uptime\r\nup 2 days\r\n',
      size_bytes: 38,
      updated_at: '2026-04-14T09:30:00Z',
    })
    deleteCredential.mockResolvedValue(undefined)
    persistWindowState.mockResolvedValue(undefined)
    renameLocalEntry.mockResolvedValue(undefined)
    renameRemoteEntry.mockResolvedValue(undefined)
    sendInput.mockResolvedValue(undefined)
    resizeTerminal.mockResolvedValue(undefined)
    uploadFile.mockResolvedValue({
      sourcePath: '/Users/yml/notes.txt',
      targetPath: '/home/root/notes.txt',
      bytesCopied: 42,
    })
    windowSetBackgroundColour.mockResolvedValue(undefined)
    windowToggleMaximise.mockResolvedValue(undefined)
    listLocalFiles.mockResolvedValue({
      path: '/Users/yml',
      parentPath: '/Users',
      entries: [
        {
          name: '.ssh',
          path: '/Users/yml/.ssh',
          size: 0,
          modTime: '2026-04-14T10:31:00Z',
          type: 'dir',
          isDir: true,
        },
        {
          name: 'codes',
          path: '/Users/yml/codes',
          size: 0,
          modTime: '2026-04-15T10:31:00Z',
          type: 'dir',
          isDir: true,
        },
        {
          name: 'notes.txt',
          path: '/Users/yml/notes.txt',
          size: 42,
          modTime: '2026-04-15T10:33:00Z',
          type: 'file',
          isDir: false,
        },
      ],
    })
    listRemoteFiles.mockResolvedValue({
      path: '/home/root',
      parentPath: '/home',
      entries: [
        {
          name: 'app',
          path: '/home/root/app',
          size: 0,
          modTime: '2026-04-15T10:31:00Z',
          type: 'dir',
          isDir: true,
        },
        {
          name: 'app.log',
          path: '/home/root/app.log',
          size: 128,
          modTime: '2026-04-15T10:32:00Z',
          type: 'file',
          isDir: false,
        },
      ],
    })
    listSessionLogs.mockResolvedValue([
      {
        id: 'log-2',
        session_id: 'session-closed',
        host_id: 'host-2',
        host_name: 'Beta',
        host_address: '10.0.0.2',
        host_port: 2222,
        ssh_username: 'deploy',
        local_username: 'yml',
        protocol: 'ssh',
        status: 'closed',
        started_at: '2026-04-14T09:27:00Z',
        ended_at: '2026-04-14T09:30:00Z',
        duration_millis: 180000,
        remote_addr: '10.0.0.2:2222',
        favorite: false,
      },
      {
        id: 'log-1',
        host_id: 'host-1',
        host_name: 'Alpha',
        host_address: '10.0.0.1',
        host_port: 22,
        ssh_username: 'root',
        local_username: 'yml',
        protocol: 'ssh',
        status: 'failed',
        started_at: '2026-04-13T11:00:00Z',
        ended_at: '2026-04-13T11:00:02Z',
        error_message: 'dial ssh: network down',
        favorite: true,
      },
    ])
    toggleSessionLogFavorite.mockResolvedValue(undefined)
    acceptHostKey.mockResolvedValue(undefined)
    onRuntimeEvent.mockImplementation((eventName, handler) => {
      runtimeHandlers.set(eventName, handler)
      return () => {
        runtimeHandlers.delete(eventName)
      }
    })
  })
}

export {
  acceptHostKey,
  addHost,
  changeMasterPassword,
  connect,
  createLocalDirectory,
  createRemoteDirectory,
  deleteCredential,
  deleteHost,
  deleteLocalEntry,
  deleteRemoteEntry,
  disconnect,
  downloadFile,
  generateCredential,
  getCredentials,
  getCredentialUsage,
  getSessionTranscript,
  getKeychainStatus,
  getVaultStatus,
  importCredential,
  initializeVaultWithPreferences,
  listHosts,
  listLocalFiles,
  listRemoteFiles,
  listSessionLogs,
  listSessions,
  onRuntimeEvent,
  persistWindowState,
  renameLocalEntry,
  renameRemoteEntry,
  resetVault,
  resizeTerminal,
  sendInput,
  toggleSessionLogFavorite,
  tryAutoUnlock,
  unlockWithPreferences,
  updateHost,
  uploadFile,
  windowSetBackgroundColour,
  windowToggleMaximise,
}
