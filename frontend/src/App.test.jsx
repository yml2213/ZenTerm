import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ThemeProvider from './contexts/ThemeProvider.jsx'
import LanguageProvider from './contexts/LanguageProvider.jsx'
import App from './App.jsx'
import {
  acceptHostKey,
  addHost,
  changeMasterPassword,
  connect,
  downloadFile,
  deleteHost,
  disconnect,
  deleteCredential,
  generateCredential,
  getCredentials,
  getCredentialUsage,
  getKeychainStatus,
  getVaultStatus,
  initializeVaultWithPreferences,
  importCredential,
  listLocalFiles,
  listHosts,
  listRemoteFiles,
  listSessions,
  onRuntimeEvent,
  persistWindowState,
  resetVault,
  resizeTerminal,
  sendInput,
  tryAutoUnlock,
  uploadFile,
  unlockWithPreferences,
  updateHost,
  windowToggleMaximise,
} from './lib/backend.js'

vi.mock('./lib/backend.js', () => ({
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
  downloadFile: vi.fn(),
  disconnect: vi.fn(),
  generateCredential: vi.fn(),
  importCredential: vi.fn(),
  getCredentials: vi.fn(),
  getCredentialUsage: vi.fn(),
  deleteCredential: vi.fn(),
  listLocalFiles: vi.fn(),
  listRemoteFiles: vi.fn(),
  listSessions: vi.fn(),
  acceptHostKey: vi.fn(),
  rejectHostKey: vi.fn(),
  sendInput: vi.fn(),
  resizeTerminal: vi.fn(),
  onRuntimeEvent: vi.fn(),
  persistWindowState: vi.fn(),
  uploadFile: vi.fn(),
  windowToggleMaximise: vi.fn(),
}))

vi.mock('./components/TerminalPane.jsx', () => ({
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

function createDeferred() {
  let resolve
  let reject

  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function renderApp() {
  return render(
    <ThemeProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ThemeProvider>,
  )
}

async function continueWithMasterPassword(user) {
  const passwordInput = await screen.findByLabelText('主密码')
  await user.type(passwordInput, 'master-password')
  await user.click(screen.getByRole('button', { name: '继续' }))
  await waitFor(() => expect(unlockWithPreferences).toHaveBeenCalledWith('master-password', true))
}

async function initializeVault(user) {
  await user.type(await screen.findByLabelText('主密码'), 'master-password')
  await user.type(screen.getByLabelText('确认主密码'), 'master-password')
  await user.click(screen.getByLabelText(/我已了解忘记主密码后无法恢复/))
  await user.click(screen.getByRole('button', { name: '创建并进入' }))
  await waitFor(() => expect(initializeVaultWithPreferences).toHaveBeenCalledWith('master-password', true))
}

describe('App', () => {
  const runtimeHandlers = new Map()
  const hosts = [
    {
      id: 'host-1',
      name: 'Alpha',
      address: '10.0.0.1',
      port: 22,
      username: 'root',
      known_hosts: '',
    },
    {
      id: 'host-2',
      name: 'Beta',
      address: '10.0.0.2',
      port: 2222,
      username: 'deploy',
      known_hosts: 'ssh-ed25519 AAAA',
    },
  ]

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
    downloadFile.mockResolvedValue({
      sourcePath: '/home/root/app.log',
      targetPath: '/Users/yml/app.log',
      bytesCopied: 128,
    })
    disconnect.mockResolvedValue(undefined)
    generateCredential.mockResolvedValue('cred-1')
    importCredential.mockResolvedValue('cred-2')
    getCredentials.mockResolvedValue([])
    getCredentialUsage.mockResolvedValue({
      credential_id: 'cred-1',
      host_ids: [],
      active_sessions: 0,
    })
    deleteCredential.mockResolvedValue(undefined)
    persistWindowState.mockResolvedValue(undefined)
    sendInput.mockResolvedValue(undefined)
    resizeTerminal.mockResolvedValue(undefined)
    uploadFile.mockResolvedValue({
      sourcePath: '/Users/yml/notes.txt',
      targetPath: '/home/root/notes.txt',
      bytesCopied: 42,
    })
    windowToggleMaximise.mockResolvedValue(undefined)
    listLocalFiles.mockResolvedValue({
      path: '/Users/yml',
      parentPath: '/Users',
      entries: [
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
    acceptHostKey.mockResolvedValue(undefined)
    onRuntimeEvent.mockImplementation((eventName, handler) => {
      runtimeHandlers.set(eventName, handler)
      return () => {
        runtimeHandlers.delete(eventName)
      }
    })
  })

  it('在缺少钥匙串记录时允许输入主密码继续', async () => {
    const user = userEvent.setup()
    renderApp()

    await waitFor(() => expect(listHosts).toHaveBeenCalledTimes(1))
    await continueWithMasterPassword(user)

    expect(screen.getByText('全部主机')).toBeInTheDocument()
  })

  it('未初始化时显示主密码设置流程，并跳过自动进入', async () => {
    const user = userEvent.setup()
    getVaultStatus.mockResolvedValue({ initialized: false, unlocked: false })

    renderApp()

    expect(await screen.findByText('设置主密码以启用本地保险箱')).toBeInTheDocument()
    expect(tryAutoUnlock).not.toHaveBeenCalled()

    await initializeVault(user)

    expect(screen.getByText('全部主机')).toBeInTheDocument()
  })

  it('支持使用系统钥匙串自动进入', async () => {
    tryAutoUnlock.mockResolvedValue(true)
    renderApp()

    await waitFor(() => expect(tryAutoUnlock).toHaveBeenCalledTimes(1))

    expect(screen.queryByLabelText('主密码')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('全部主机')).toBeInTheDocument())
  })

  it('默认打开 Vaults，并支持切换到 SFTP 工作区', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)

    expect(screen.getByText('全部主机')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /SFTP/i }))

    expect(await screen.findByText('先选择一个主机')).toBeInTheDocument()
    expect(await screen.findByText('Local')).toBeInTheDocument()
    expect(listLocalFiles).toHaveBeenCalled()
  })

  it('支持通过加号打开空白标签并从最近连接进入 SSH', async () => {
    const user = userEvent.setup()
    connect.mockResolvedValueOnce('session-new-tab')
    listSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ID: 'session-new-tab', HostID: 'host-1', RemoteAddr: '10.0.0.1:22' },
      ])

    renderApp()

    await continueWithMasterPassword(user)
    expect(screen.queryByRole('button', { name: 'New Tab' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新增标签页' }))

    expect(await screen.findByText('最近连接')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索主机...')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Alpha root@10.0.0.1:22 SSH/ }))

    const terminalPane = await screen.findByTestId('terminal-pane')
    expect(within(terminalPane).getByText('Alpha')).toBeInTheDocument()
    expect(connect).toHaveBeenCalledWith('host-1')
  })

  it('空白标签可以全部关闭，关闭后只保留新增标签按钮', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: '新增标签页' }))

    expect(await screen.findByRole('button', { name: 'New Tab' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭 New Tab' }))

    expect(screen.queryByRole('button', { name: 'New Tab' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增标签页' })).toBeInTheDocument()
    expect(await screen.findByText('全部主机')).toBeInTheDocument()
  })

  it('SFTP 工作区支持上传和下载文件', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))
    await user.click((await screen.findAllByRole('button', { name: '选择主机' }))[0])

    expect(await screen.findByText('notes.txt')).toBeInTheDocument()
    expect(await screen.findByText('app.log')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /notes.txt/i }))
    await user.click(screen.getByRole('button', { name: '上传到远端' }))

    await waitFor(() => {
      expect(uploadFile).toHaveBeenCalledWith('host-1', '/Users/yml/notes.txt', '/home/root')
    })

    await user.click(screen.getByRole('button', { name: /app.log/i }))
    await user.click(screen.getByRole('button', { name: '下载到本地' }))

    await waitFor(() => {
      expect(downloadFile).toHaveBeenCalledWith('host-1', '/home/root/app.log', '/Users/yml')
    })
  })

  it('设置页支持修改主密码', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: '设置' }))

    await user.type(await screen.findByLabelText('当前主密码'), 'master-password')
    await user.type(screen.getByLabelText('新主密码'), 'next-password')
    await user.type(screen.getByLabelText('确认新主密码'), 'next-password')
    await user.click(screen.getByRole('button', { name: '更新主密码' }))

    await waitFor(() => {
      expect(changeMasterPassword).toHaveBeenCalledWith('master-password', 'next-password', true)
    })
  })

  it('已知主机页展示真实可信记录', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: '已知主机' }))

    expect(screen.getAllByRole('heading', { name: '已知主机' }).length).toBeGreaterThan(0)
    expect(await screen.findByText('可信记录')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('1 条已保存')).toBeInTheDocument()
    expect(screen.getByText(/ssh-ed25519/)).toBeInTheDocument()
  })

  it('钥匙串页点击生成后才展示右侧抽屉', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: '钥匙串' }))

    await waitFor(() => expect(getCredentials).toHaveBeenCalled())
    expect(screen.getByText('暂无SSH 密钥')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '生成 SSH 密钥' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '生成' }))

    expect(screen.getByRole('dialog', { name: '生成 SSH 密钥' })).toBeInTheDocument()
    expect(screen.getByLabelText('密钥标签')).toBeInTheDocument()
    expect(screen.getByText('密钥算法')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭' }))

    expect(screen.queryByRole('dialog', { name: '生成 SSH 密钥' })).not.toBeInTheDocument()
  })

  it('设置页支持重置 Vault', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByLabelText(/我确认要清空当前 Vault/))
    await user.click(screen.getByRole('button', { name: '重置 Vault' }))

    await waitFor(() => expect(resetVault).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('设置主密码以启用本地保险箱')).toBeInTheDocument()
  })

  it('新增主机时会拆分 host 和 identity 参数', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /New Host|新建主机/ }))
    await user.clear(screen.getByLabelText('主机 ID'))
    await user.type(screen.getByLabelText('主机 ID'), 'host-3')
    await user.type(screen.getByLabelText('显示名称'), 'Gamma')
    await user.type(screen.getByLabelText('地址'), '10.0.0.3')
    await user.clear(screen.getByLabelText('端口'))
    await user.type(screen.getByLabelText('端口'), '2200')
    await user.clear(screen.getByLabelText('用户名'))
    await user.type(screen.getByLabelText('用户名'), 'ops')
    await user.type(screen.getByLabelText('密码'), 'secret-pass')
    await user.type(screen.getByLabelText('私钥'), 'PRIVATE KEY')
    await user.click(screen.getByRole('button', { name: '加密保存' }))

    await waitFor(() => {
      expect(addHost).toHaveBeenCalledWith(
        {
          id: 'host-3',
          name: 'Gamma',
          address: '10.0.0.3',
          port: 2200,
          username: 'ops',
        },
        {
          password: 'secret-pass',
          private_key: 'PRIVATE KEY',
        },
      )
    })
  })

  it('新增主机时如果没有认证方式会直接拦截', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /New Host|新建主机/ }))
    await user.clear(screen.getByLabelText('主机 ID'))
    await user.type(screen.getByLabelText('主机 ID'), 'host-empty-auth')
    await user.type(screen.getByLabelText('地址'), '10.0.0.9')
    await user.clear(screen.getByLabelText('用户名'))
    await user.type(screen.getByLabelText('用户名'), 'root')
    await user.click(screen.getByRole('button', { name: '加密保存' }))

    expect(await screen.findByText('请至少配置一种 SSH 认证方式：密码、私钥或凭据。')).toBeInTheDocument()
    expect(addHost).not.toHaveBeenCalled()
  })

  it('编辑主机时保留 ID 并调用 updateHost', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getAllByRole('button', { name: '编辑' })[0])

    expect(screen.getByLabelText('主机 ID')).toBeDisabled()
    await user.clear(screen.getByLabelText('显示名称'))
    await user.type(screen.getByLabelText('显示名称'), 'Alpha Prime')
    await user.click(screen.getByRole('button', { name: '保存修改' }))

    await waitFor(() => {
      expect(updateHost).toHaveBeenCalledWith(
        {
          id: 'host-1',
          name: 'Alpha Prime',
          address: '10.0.0.1',
          port: 22,
          username: 'root',
        },
        {
          password: '',
          private_key: '',
        },
      )
    })
  })

  it('支持多标签终端切换和关闭', async () => {
    const user = userEvent.setup()
    connect.mockResolvedValueOnce('session-1').mockResolvedValueOnce('session-2')
    listSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ID: 'session-1', HostID: 'host-1', RemoteAddr: '10.0.0.1:22' },
      ])
      .mockResolvedValueOnce([
        { ID: 'session-1', HostID: 'host-1', RemoteAddr: '10.0.0.1:22' },
        { ID: 'session-2', HostID: 'host-2', RemoteAddr: '10.0.0.2:2222' },
      ])

    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getAllByRole('button', { name: '连接' })[0])
    await waitFor(() => expect(screen.getByRole('button', { name: /Alpha 10.0.0.1:22/ })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Vaults/i }))
    await user.click(screen.getAllByRole('button', { name: '连接' })[1])
    await waitFor(() => expect(screen.getByRole('button', { name: /Beta 10.0.0.2:2222/ })).toBeInTheDocument())

    const alphaTab = screen.getByRole('button', { name: /Alpha 10.0.0.1:22/ })
    const betaTab = screen.getByRole('button', { name: /Beta 10.0.0.2:2222/ })

    expect(betaTab.closest('.session-tab')).toHaveClass('active')

    await user.click(alphaTab)
    expect(alphaTab.closest('.session-tab')).toHaveClass('active')
    expect(betaTab.closest('.session-tab')).not.toHaveClass('active')

    await user.click(screen.getByRole('button', { name: '关闭 Alpha' }))
    await waitFor(() => expect(disconnect).toHaveBeenCalledWith('session-1'))
    expect(screen.getByRole('button', { name: /Beta 10.0.0.2:2222/ }).closest('.session-tab')).toHaveClass('active')
  })

  it('连接后会进入独立 SSH 界面，并可通过顶部切换 Vaults 和 SFTP', async () => {
    const user = userEvent.setup()
    connect.mockResolvedValueOnce('session-1')
    listSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ID: 'session-1', HostID: 'host-1', RemoteAddr: '10.0.0.1:22' },
      ])

    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getAllByRole('button', { name: '连接' })[0])

    const terminalPane = await screen.findByTestId('terminal-pane')
    expect(within(terminalPane).getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '连接' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Vaults/i }))
    expect(await screen.findByText('全部主机')).toBeInTheDocument()
    expect(await screen.findAllByRole('button', { name: '连接' })).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /SFTP/i }))
    expect(await screen.findByText('文件工作区')).toBeInTheDocument()
    expect(await screen.findByText('先选择一个主机')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Alpha 10.0.0.1:22/ }))
    expect(await screen.findByTestId('terminal-pane')).toBeInTheDocument()
  })

  it('连接缺少认证方式的主机会显示中文错误', async () => {
    const user = userEvent.setup()
    connect.mockRejectedValueOnce(new Error('no supported ssh authentication method configured'))

    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getAllByRole('button', { name: '连接' })[0])

    expect(await screen.findByText('当前主机未配置认证方式，请填写密码、私钥或选择一个凭据后再连接。')).toBeInTheDocument()
  })

  it('终端面板会跟随活跃会话并把输入与尺寸同步到后端', async () => {
    const user = userEvent.setup()
    listSessions
      .mockResolvedValueOnce([
        { ID: 'session-boot', HostID: 'host-1', RemoteAddr: '10.0.0.1:22' },
      ])
      .mockResolvedValueOnce([
        { ID: 'session-boot', HostID: 'host-1', RemoteAddr: '10.0.0.1:22' },
        { ID: 'session-2', HostID: 'host-2', RemoteAddr: '10.0.0.2:2222' },
      ])
    connect.mockResolvedValueOnce('session-2')

    renderApp()

    await continueWithMasterPassword(user)
    const terminalPane = await screen.findByTestId('terminal-pane')
    expect(within(terminalPane).getByText('Alpha')).toBeInTheDocument()
    expect(within(terminalPane).getByText('10.0.0.1:22')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Vaults/i }))
    await user.click(screen.getAllByRole('button', { name: '连接' })[1])
    await waitFor(() => expect(within(screen.getByTestId('terminal-pane')).getByText('Beta')).toBeInTheDocument())
    expect(within(screen.getByTestId('terminal-pane')).getByText('10.0.0.2:2222')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '发送终端输入' }))
    await user.click(screen.getByRole('button', { name: '调整终端尺寸' }))

    await waitFor(() => {
      expect(sendInput).toHaveBeenCalledWith('session-2', 'pwd\n')
      expect(resizeTerminal).toHaveBeenCalledWith('session-2', 120, 36)
    })

    await user.click(screen.getByRole('button', { name: '模拟会话关闭' }))
    expect(within(screen.getByTestId('terminal-pane')).getByText('Alpha')).toBeInTheDocument()
    expect(within(screen.getByTestId('terminal-pane')).queryByText('Beta')).not.toBeInTheDocument()
  })

  it('通过运行时事件驱动 Host Key 确认流程', async () => {
    const user = userEvent.setup()
    const pendingConnect = createDeferred()

    listSessions
      .mockResolvedValueOnce([
        { ID: 'session-boot', HostID: 'host-2', RemoteAddr: '10.0.0.2:2222' },
      ])
      .mockResolvedValueOnce([
        { ID: 'session-boot', HostID: 'host-2', RemoteAddr: '10.0.0.2:2222' },
        { ID: 'session-key', HostID: 'host-1', RemoteAddr: '10.0.0.1:22' },
      ])
    connect.mockReturnValueOnce(pendingConnect.promise)

    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /Vaults/i }))
    await user.click(screen.getAllByRole('button', { name: '连接' })[0])

    runtimeHandlers.get('ssh:host-key:confirm')?.({
      hostID: 'host-1',
      remoteAddr: '10.0.0.1:22',
      key: 'ssh-ed25519 AAAATEST',
      sha256: 'SHA256:abc',
      md5: 'MD5:def',
    })

    expect(await screen.findByText('首次连接需要确认远端主机指纹')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '信任并连接' }))

    await waitFor(() => {
      expect(acceptHostKey).toHaveBeenCalledWith('host-1', 'ssh-ed25519 AAAATEST')
    })

    pendingConnect.resolve('session-key')
    await waitFor(() => expect(screen.getByRole('button', { name: /Alpha 10.0.0.1:22/ })).toBeInTheDocument())
  })

  it('双击顶部空白区域时切换窗口最大化', async () => {
    const user = userEvent.setup()
    renderApp()

    await waitFor(() => expect(listHosts).toHaveBeenCalled())
    const workspaceStrip = document.querySelector('.workspace-strip')
    if (!workspaceStrip) {
      throw new Error('workspace strip not found')
    }

    await user.dblClick(workspaceStrip)
    expect(windowToggleMaximise).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(persistWindowState).toHaveBeenCalled())
  })

  it('窗口尺寸变化后会防抖保存窗口状态', async () => {
    renderApp()

    await waitFor(() => expect(listHosts).toHaveBeenCalled())

    window.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(persistWindowState).toHaveBeenCalledTimes(1))
  })
})
