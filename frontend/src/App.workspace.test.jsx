import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  continueWithMasterPassword,
  createDeferred,
  registerAppHarness,
  renderApp,
  runtimeHandlers,
} from './test/appTestHarness.jsx'
import {
  acceptHostKey,
  connect,
  disconnect,
  listHosts,
  listSessions,
  persistWindowState,
  resizeTerminal,
  sendInput,
  windowToggleMaximise,
} from './lib/backend.js'

registerAppHarness()

describe('App workspace flows', () => {
  it('默认打开 Vaults，并支持切换到 SFTP 工作区', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)

    expect(screen.getByLabelText('搜索主机')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /SFTP/i }))

    expect(await screen.findByText('先选择一个主机')).toBeInTheDocument()
    expect(await screen.findByText('Local')).toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: '新标签页' })).not.toBeInTheDocument()

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

    expect(await screen.findByRole('button', { name: '新标签页' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭 新标签页' }))

    expect(screen.queryByRole('button', { name: '新标签页' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新增标签页' })).toBeInTheDocument()
    expect(await screen.findByLabelText('搜索主机')).toBeInTheDocument()
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
    expect(await screen.findByLabelText('搜索主机')).toBeInTheDocument()
    expect(await screen.findAllByRole('button', { name: '连接' })).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /SFTP/i }))
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
