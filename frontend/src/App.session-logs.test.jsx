import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  continueWithMasterPassword,
  registerAppHarness,
  renderApp,
} from './test/appTestHarness.jsx'
import {
  connect,
  listSessionLogs,
  toggleSessionLogFavorite,
} from './lib/backend.js'

registerAppHarness()

describe('App session logs', () => {
  it('日志页展示连接历史并支持筛选收藏和重连', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: '日志' }))

    await waitFor(() => expect(listSessionLogs).toHaveBeenCalledWith(200))
    expect(await screen.findByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('已关闭')).toBeInTheDocument()
    expect(screen.getAllByText('失败').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '收藏' }))
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /取消收藏 Alpha/ }))
    await waitFor(() => expect(toggleSessionLogFavorite).toHaveBeenCalledWith('log-1', false))

    await user.click(screen.getByRole('button', { name: '全部' }))
    await user.dblClick(screen.getByText('Beta'))
    await waitFor(() => expect(connect).toHaveBeenCalledWith('host-2'))
  })
})
