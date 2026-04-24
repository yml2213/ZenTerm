import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  continueWithMasterPassword,
  initializeVault,
  registerAppHarness,
  renderApp,
} from './test/appTestHarness.jsx'
import {
  changeMasterPassword,
  getCredentials,
  getVaultStatus,
  listHosts,
  resetVault,
  tryAutoUnlock,
} from './lib/backend.js'

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
