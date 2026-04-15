import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ThemeProvider from './contexts/ThemeProvider.jsx'
import LanguageProvider from './contexts/LanguageProvider.jsx'
import App from './App.jsx'
import {
  acceptHostKey,
  addHost,
  connect,
  deleteHost,
  disconnect,
  listLocalFiles,
  listHosts,
  listRemoteFiles,
  listSessions,
  onRuntimeEvent,
  unlock,
  updateHost,
} from './lib/backend.js'

vi.mock('./lib/backend.js', () => ({
  listHosts: vi.fn(),
  addHost: vi.fn(),
  updateHost: vi.fn(),
  deleteHost: vi.fn(),
  unlock: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  listLocalFiles: vi.fn(),
  listRemoteFiles: vi.fn(),
  listSessions: vi.fn(),
  acceptHostKey: vi.fn(),
  rejectHostKey: vi.fn(),
  sendInput: vi.fn(),
  resizeTerminal: vi.fn(),
  onRuntimeEvent: vi.fn(),
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

async function unlockVault(user) {
  await user.type(screen.getByLabelText('主密码'), 'master-password')
  await user.click(screen.getByRole('button', { name: '解锁并继续' }))
  await waitFor(() => expect(unlock).toHaveBeenCalledWith('master-password'))
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
    runtimeHandlers.clear()
    localStorage.clear()

    listHosts.mockResolvedValue(hosts)
    listSessions.mockResolvedValue([])
    addHost.mockResolvedValue(undefined)
    updateHost.mockResolvedValue(undefined)
    deleteHost.mockResolvedValue(undefined)
    unlock.mockResolvedValue(undefined)
    connect.mockResolvedValue('session-1')
    disconnect.mockResolvedValue(undefined)
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

  it('提交主密码解锁保险箱', async () => {
    const user = userEvent.setup()
    renderApp()

    await waitFor(() => expect(listHosts).toHaveBeenCalledTimes(1))
    await unlockVault(user)

    expect(screen.getByText('保险箱已解锁')).toBeInTheDocument()
  })

  it('默认打开 Vaults，并支持切换到 SFTP 工作区', async () => {
    const user = userEvent.setup()
    renderApp()

    await unlockVault(user)

    expect(screen.getByText('全部主机')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /SFTP/i }))

    expect(screen.getByText('先选择一个主机')).toBeInTheDocument()
    expect(screen.getByText('Local')).toBeInTheDocument()
    expect(listLocalFiles).toHaveBeenCalled()
  })

  it('新增主机时会拆分 host 和 identity 参数', async () => {
    const user = userEvent.setup()
    renderApp()

    await unlockVault(user)
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

  it('编辑主机时保留 ID 并调用 updateHost', async () => {
    const user = userEvent.setup()
    renderApp()

    await unlockVault(user)
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

    await unlockVault(user)
    await user.click(screen.getAllByRole('button', { name: '连接' })[0])
    await waitFor(() => expect(screen.getByRole('button', { name: /Alpha 10.0.0.1:22/ })).toBeInTheDocument())

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

  it('通过运行时事件驱动 Host Key 确认流程', async () => {
    const user = userEvent.setup()
    const pendingConnect = createDeferred()

    listSessions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { ID: 'session-key', HostID: 'host-1', RemoteAddr: '10.0.0.1:22' },
      ])
    connect.mockReturnValueOnce(pendingConnect.promise)

    renderApp()

    await unlockVault(user)
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
})
