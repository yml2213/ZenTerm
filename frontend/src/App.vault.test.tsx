// @ts-nocheck
import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  continueWithMasterPassword,
  initializeVault,
  registerAppHarness,
  renderApp,
} from './test/appTestHarness'
import {
  changeMasterPassword,
  checkForUpdates,
  downloadUpdate,
  getUpdateConfig,
  getCredentials,
  getVaultStatus,
  importLocalSSHConfigHosts,
  listHosts,
  listLocalSSHConfigHosts,
  resetVault,
  saveUpdateConfig,
  tryAutoUnlock,
} from './lib/backend'

registerAppHarness()

describe('App vault flows', () => {
  it('在缺少钥匙串记录时允许输入主密码继续', async () => {
    const user = userEvent.setup()
    renderApp()

    await waitFor(() => expect(listHosts).toHaveBeenCalledTimes(1))
    await continueWithMasterPassword(user)

    expect(screen.getByLabelText('搜索主机')).toBeInTheDocument()
  })

  it('未初始化时显示主密码设置流程，并跳过自动进入', async () => {
    const user = userEvent.setup()
    getVaultStatus.mockResolvedValue({ initialized: false, unlocked: false })

    renderApp()

    expect(await screen.findByText('设置主密码以启用本地保险箱')).toBeInTheDocument()
    expect(tryAutoUnlock).not.toHaveBeenCalled()

    await initializeVault(user)

    expect(screen.getByLabelText('搜索主机')).toBeInTheDocument()
  })

  it('支持使用系统钥匙串自动进入', async () => {
    tryAutoUnlock.mockResolvedValue(true)
    renderApp()

    await waitFor(() => expect(tryAutoUnlock).toHaveBeenCalledTimes(1))

    expect(screen.queryByLabelText('主密码')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('搜索主机')).toBeInTheDocument())
  })

  it('发现本机 SSH 配置时使用应用弹窗导入', async () => {
    const user = userEvent.setup()
    tryAutoUnlock.mockResolvedValue(true)
    listLocalSSHConfigHosts.mockResolvedValue([
      {
        id: 'ssh-config-prod',
        alias: 'prod',
        host_name: 'prod.example.com',
        user: 'deploy',
        port: 22,
        imported: false,
      },
    ])

    renderApp()

    expect(await screen.findByRole('dialog', { name: '导入 SSH 配置' })).toBeInTheDocument()
    expect(screen.getByText('prod (deploy@prod.example.com:22)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '导入配置' }))

    await waitFor(() => {
      expect(importLocalSSHConfigHosts).toHaveBeenCalledWith(['ssh-config-prod'])
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

  it('设置页支持更新设置和手动检查', async () => {
    const user = userEvent.setup()
    checkForUpdates.mockResolvedValue({
      available: true,
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      releaseNotes: '修复连接稳定性',
      downloadUrl: 'https://example.com/ZenTerm-0.2.0-macos-universal.zip',
      downloadSize: 1048576,
    })

    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: /更新.*版本检查与下载/ }))

    await waitFor(() => expect(getUpdateConfig).toHaveBeenCalledTimes(1))
    await user.click(await screen.findByLabelText(/发现新版本后自动下载/))
    await user.click(screen.getByRole('button', { name: /保存更新设置/ }))

    await waitFor(() => {
      expect(saveUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({ auto_download: true }))
    })

    await user.click(screen.getByRole('button', { name: /检查更新/ }))

    expect(await screen.findByText('发现新版本 0.2.0。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /下载更新/ }))

    await waitFor(() => {
      expect(downloadUpdate).toHaveBeenCalledWith('https://example.com/ZenTerm-0.2.0-macos-universal.zip')
    })
  })

  it('设置页支持开启终端快速编辑模式', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: /终端.*右键复制与粘贴/ }))

    const quickEditToggle = await screen.findByLabelText(/快速编辑模式/)
    expect(quickEditToggle).not.toBeChecked()

    await user.click(quickEditToggle)

    expect(quickEditToggle).toBeChecked()
    expect(window.localStorage.getItem('zenterm-terminal-quick-edit')).toBe('true')
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
})
