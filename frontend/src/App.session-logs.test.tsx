// @ts-nocheck
import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  continueWithMasterPassword,
  registerAppHarness,
  renderApp,
} from './test/appTestHarness'
import {
  connect,
  getSessionTranscript,
  listSessionLogs,
  toggleSessionLogFavorite,
  deleteSessionLog,
  clearSessionLogs,
} from './lib/backend'

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

    await user.click(screen.getByText('Beta'))
    await waitFor(() => expect(getSessionTranscript).toHaveBeenCalledWith('log-2'))
    expect(await screen.findByText(/visible|uptime|Connected: Beta/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '新标签页打开终端日志' }))
    expect(await screen.findByTestId('log-workspace')).toBeInTheDocument()
    expect(screen.getAllByText('日志：Beta').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '关闭日志标签页' }))
    await user.click(screen.getByRole('button', { name: '日志' }))

    await user.click(screen.getByRole('button', { name: '收藏' }))
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /取消收藏 Alpha/ }))
    await waitFor(() => expect(toggleSessionLogFavorite).toHaveBeenCalledWith('log-1', false))

    await user.click(screen.getByRole('button', { name: '全部' }))
    await user.dblClick(screen.getByText('Beta'))
    await waitFor(() => expect(connect).toHaveBeenCalledWith('host-2'))
  })

  it('支持单条删除与清空全部日志', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: '日志' }))

    await waitFor(() => expect(listSessionLogs).toHaveBeenCalledWith(200))
    await screen.findByText('Beta')

    // 单条删除
    await user.click(screen.getByRole('button', { name: '删除日志 Beta' }))
    await waitFor(() => expect(deleteSessionLog).toHaveBeenCalledWith('log-2'))
    await waitFor(() => expect(screen.queryByText('Beta')).not.toBeInTheDocument())
    expect(screen.getByText('Alpha')).toBeInTheDocument()

    // 清空全部（二次确认）
    await user.click(screen.getByRole('button', { name: '清空全部日志' }))
    await user.click(screen.getByRole('button', { name: '确认清空全部日志' }))
    await waitFor(() => expect(clearSessionLogs).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument())
    expect(screen.getByText('连接后会在这里生成历史记录')).toBeInTheDocument()
  })
})
