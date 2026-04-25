import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  continueWithMasterPassword,
  registerAppHarness,
  renderApp,
} from './test/appTestHarness.jsx'
import { addHost, updateHost } from './lib/backend.js'

registerAppHarness()

describe('App host management', () => {
  it('主机页支持列表视图和右键复制地址', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: '列表' }))
    expect(document.querySelector('.host-grid-list')).toBeInTheDocument()

    fireEvent.contextMenu(screen.getByRole('button', { name: /Alpha.*root@10\.0\.0\.1:22/ }))
    await user.click(screen.getByRole('menuitem', { name: '复制地址' }))

    expect(writeText).toHaveBeenCalledWith('root@10.0.0.1:22')
  })

  it('主机页支持按收藏、分组和标签筛选', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    expect(screen.getByRole('button', { name: /收藏 1/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /收藏 1/ }))
    expect(screen.getByRole('button', { name: /收藏 1/ })).toHaveClass('active')
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /测试环境 1/ }))
    expect(screen.getByRole('button', { name: /测试环境 1/ })).toHaveClass('active')
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Linux/ }))
    expect(screen.getByRole('button', { name: 'Linux' })).toHaveClass('active')
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })

  it('已知主机页展示真实可信记录', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: '已知主机' }))

    expect(await screen.findByText('可信记录')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '已知主机' })).not.toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('1 条已保存')).toBeInTheDocument()
    expect(screen.getByText(/ssh-ed25519/)).toBeInTheDocument()
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
    await user.type(screen.getByLabelText('分组'), '本地')
    await user.type(screen.getByLabelText('标签'), 'Linux, Dev')
    await user.click(screen.getByLabelText('收藏主机'))
    await user.type(screen.getByLabelText('密码'), 'secret-pass')
    await user.click(screen.getByRole('button', { name: '加密保存' }))

    await waitFor(() => {
      expect(addHost).toHaveBeenCalledWith(
        {
          id: 'host-3',
          name: 'Gamma',
          address: '10.0.0.3',
          port: 2200,
          username: 'ops',
          group: '本地',
          tags: 'Linux, Dev',
          favorite: true,
          system_type_source: 'auto',
        },
        {
          password: 'secret-pass',
          private_key: '',
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

  it('新增主机支持切换到密钥认证并填写私钥', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /New Host|新建主机/ }))
    await user.clear(screen.getByLabelText('主机 ID'))
    await user.type(screen.getByLabelText('主机 ID'), 'host-key-auth')
    await user.type(screen.getByLabelText('地址'), '10.0.0.11')
    await user.clear(screen.getByLabelText('用户名'))
    await user.type(screen.getByLabelText('用户名'), 'deploy')
    await user.click(screen.getByRole('button', { name: /密钥 \/ 证书 \/ 本地密钥/ }))
    await user.click(screen.getByRole('menuitem', { name: /本地密钥文件/ }))

    expect(screen.getByLabelText('密码')).toBeDisabled()
    expect(screen.getByLabelText('私钥')).toBeInTheDocument()

    await user.type(screen.getByLabelText('私钥'), 'PRIVATE KEY')
    await user.click(screen.getByRole('button', { name: '加密保存' }))

    await waitFor(() => {
      expect(addHost).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'host-key-auth',
          address: '10.0.0.11',
          username: 'deploy',
        }),
        {
          password: '',
          private_key: 'PRIVATE KEY',
        },
      )
    })
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
          group: '生产环境',
          tags: 'Linux, DB',
          favorite: true,
          system_type_source: 'auto',
        },
        {
          password: '',
          private_key: '',
        },
      )
    })
  })
})
