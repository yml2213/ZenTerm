import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  continueWithMasterPassword,
  registerAppHarness,
  renderApp,
} from './test/appTestHarness.jsx'
import {
  createLocalDirectory,
  deleteLocalEntry,
  downloadFile,
  listLocalFiles,
  listRemoteFiles,
  renameRemoteEntry,
  uploadFile,
} from './lib/backend.js'

registerAppHarness()

describe('App SFTP flows', () => {
  it('SFTP 工作区支持上传和下载文件', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))
    await user.click((await screen.findAllByRole('button', { name: '选择主机' }))[0])

    expect(await screen.findByText('本机目录')).toBeInTheDocument()
    expect(await screen.findByText('root@10.0.0.1:22')).toBeInTheDocument()
    expect(await screen.findByText('notes.txt')).toBeInTheDocument()
    expect(await screen.findByText('app.log')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上传到远端' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下载到本地' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'notes.txt，文件' }))
    expect(screen.getByText('已选文件')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '上传到远端' }))

    await waitFor(() => {
      expect(uploadFile).toHaveBeenCalledWith('host-1', '/Users/yml/notes.txt', '/home/root', false)
    })

    await user.click(screen.getByRole('button', { name: 'app.log，文件' }))
    await user.click(screen.getByRole('button', { name: '下载到本地' }))

    await waitFor(() => {
      expect(downloadFile).toHaveBeenCalledWith('host-1', '/home/root/app.log', '/Users/yml', false)
    })

    expect(screen.getByText('已下载 app.log → /Users/yml/app.log')).toBeInTheDocument()
  })

  it('SFTP 工作区支持在远端面板内切换主机', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))
    await user.click((await screen.findAllByRole('button', { name: '选择主机' }))[0])

    const hostSwitcher = await screen.findByLabelText('切换 SFTP 主机')
    await user.selectOptions(hostSwitcher, 'host-2')

    await waitFor(() => {
      expect(listRemoteFiles).toHaveBeenLastCalledWith('host-2', '')
    })

    expect(await screen.findByText('deploy@10.0.0.2:2222')).toBeInTheDocument()
  })

  it('SFTP 工作区支持右键重命名远端文件', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))
    await user.click((await screen.findAllByRole('button', { name: '选择主机' }))[0])

    fireEvent.contextMenu(await screen.findByRole('button', { name: 'app.log，文件' }))
    await user.click(screen.getByRole('menuitem', { name: '重命名' }))

    const input = await screen.findByLabelText('新名称')
    await user.clear(input)
    await user.type(input, 'app-renamed.log')
    await user.click(screen.getByRole('button', { name: '确认重命名' }))

    await waitFor(() => {
      expect(renameRemoteEntry).toHaveBeenCalledWith('host-1', '/home/root/app.log', 'app-renamed.log')
    })

    expect(screen.getByText('已重命名远端文件为 app-renamed.log')).toBeInTheDocument()
  })

  it('SFTP 工作区支持在空白区域右键新建本地目录', async () => {
    const user = userEvent.setup()
    const view = renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))

    const localBody = view.container.querySelector('.sftp-pane-local .sftp-file-body')
    expect(localBody).not.toBeNull()

    fireEvent.contextMenu(localBody)
    await user.click(screen.getByRole('menuitem', { name: '新建目录' }))

    const input = await screen.findByLabelText('目录名称')
    await user.type(input, 'logs')
    await user.click(screen.getByRole('button', { name: '确认创建' }))

    await waitFor(() => {
      expect(createLocalDirectory).toHaveBeenCalledWith('/Users/yml', 'logs')
    })

    expect(screen.getByText('已在本地创建目录 logs')).toBeInTheDocument()
  })

  it('SFTP 默认隐藏 . 开头文件，并可通过右键菜单显示', async () => {
    const user = userEvent.setup()
    const view = renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))

    expect(screen.getByText(/已隐藏 \. 开头项目/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '.ssh，文件夹' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '选择 .ssh' })).not.toBeInTheDocument()

    const localBody = view.container.querySelector('.sftp-pane-local .sftp-file-body')
    expect(localBody).not.toBeNull()

    fireEvent.contextMenu(localBody)
    await user.click(screen.getByRole('menuitem', { name: '显示隐藏文件' }))

    expect(await screen.findByRole('button', { name: '.ssh，文件夹' })).toBeInTheDocument()
    expect(screen.queryByText(/已隐藏 \. 开头项目/)).not.toBeInTheDocument()
  })

  it('SFTP 删除确认会区分远端目录和文件', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))
    await user.click((await screen.findAllByRole('button', { name: '选择主机' }))[0])

    fireEvent.contextMenu(await screen.findByRole('button', { name: /app，文件夹/i }))
    await user.click(screen.getByRole('menuitem', { name: '删除' }))

    expect(await screen.findByText('将递归删除远端目录 app，包含其下全部内容，此操作不可撤销。')).toBeInTheDocument()
  })

  it('SFTP 传输遇到重名时支持确认覆盖后继续下载', async () => {
    const user = userEvent.setup()
    downloadFile
      .mockRejectedValueOnce(new Error('transfer target already exists'))
      .mockResolvedValueOnce({
        sourcePath: '/home/root/app.log',
        targetPath: '/Users/yml/app.log',
        bytesCopied: 128,
      })

    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))
    await user.click((await screen.findAllByRole('button', { name: '选择主机' }))[0])

    await user.click(screen.getByRole('button', { name: 'app.log，文件' }))
    await user.click(screen.getByRole('button', { name: '下载到本地' }))

    expect(await screen.findByText('目标本地文件 app.log 已存在。确认后将用 app.log 覆盖现有文件。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '覆盖并继续' }))

    await waitFor(() => {
      expect(downloadFile).toHaveBeenNthCalledWith(1, 'host-1', '/home/root/app.log', '/Users/yml', false)
      expect(downloadFile).toHaveBeenNthCalledWith(2, 'host-1', '/home/root/app.log', '/Users/yml', true)
    })

    expect(screen.getByText('已下载 app.log → /Users/yml/app.log')).toBeInTheDocument()
  })

  it('SFTP 支持批量删除本地条目', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))

    expect(screen.queryByRole('button', { name: '选择 codes' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'codes，文件夹' }))
    fireEvent.click(screen.getByRole('button', { name: 'notes.txt，文件' }), { ctrlKey: true })

    await user.click(screen.getByRole('button', { name: '删除所选 (2)' }))

    expect(await screen.findByText('将删除本地已选 2 个条目，其中 1 个目录会递归删除，此操作不可撤销。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '删除所选' }))

    await waitFor(() => {
      expect(deleteLocalEntry).toHaveBeenCalledWith('/Users/yml/codes')
      expect(deleteLocalEntry).toHaveBeenCalledWith('/Users/yml/notes.txt')
    })

    expect(screen.getByText('已删除本地 2 个条目')).toBeInTheDocument()
  })

  it('SFTP 支持 Shift 连续选择后批量删除', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))

    fireEvent.click(screen.getByRole('button', { name: 'codes，文件夹' }))
    fireEvent.click(screen.getByRole('button', { name: 'notes.txt，文件' }), { shiftKey: true })

    expect(screen.getByText('已选 2 项')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '删除所选 (2)' }))
    expect(await screen.findByText('将删除本地已选 2 个条目，其中 1 个目录会递归删除，此操作不可撤销。')).toBeInTheDocument()
  })

  it('SFTP 支持批量上传所选文件', async () => {
    const user = userEvent.setup()
    listLocalFiles.mockResolvedValue({
      path: '/Users/yml',
      parentPath: '/Users',
      entries: [
        {
          name: 'notes.txt',
          path: '/Users/yml/notes.txt',
          size: 42,
          modTime: '2026-04-15T10:33:00Z',
          type: 'file',
          isDir: false,
        },
        {
          name: 'draft.txt',
          path: '/Users/yml/draft.txt',
          size: 18,
          modTime: '2026-04-16T10:33:00Z',
          type: 'file',
          isDir: false,
        },
      ],
    })
    uploadFile
      .mockResolvedValueOnce({
        sourcePath: '/Users/yml/notes.txt',
        targetPath: '/home/root/notes.txt',
        bytesCopied: 42,
      })
      .mockResolvedValueOnce({
        sourcePath: '/Users/yml/draft.txt',
        targetPath: '/home/root/draft.txt',
        bytesCopied: 18,
      })

    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))
    await user.click((await screen.findAllByRole('button', { name: '选择主机' }))[0])

    fireEvent.click(screen.getByRole('button', { name: 'notes.txt，文件' }))
    fireEvent.click(screen.getByRole('button', { name: 'draft.txt，文件' }), { ctrlKey: true })
    await user.click(screen.getByRole('button', { name: '上传所选 (2)' }))

    await waitFor(() => {
      expect(uploadFile).toHaveBeenNthCalledWith(1, 'host-1', '/Users/yml/notes.txt', '/home/root', false)
      expect(uploadFile).toHaveBeenNthCalledWith(2, 'host-1', '/Users/yml/draft.txt', '/home/root', false)
    })

    expect(screen.getByText('已上传 2 个文件到 /home/root')).toBeInTheDocument()
  })

  it('SFTP 支持通过右键菜单删除已选条目', async () => {
    const user = userEvent.setup()
    renderApp()

    await continueWithMasterPassword(user)
    await user.click(screen.getByRole('button', { name: /SFTP/i }))

    fireEvent.click(screen.getByRole('button', { name: 'codes，文件夹' }))
    fireEvent.click(screen.getByRole('button', { name: 'notes.txt，文件' }), { ctrlKey: true })

    fireEvent.contextMenu(screen.getByRole('button', { name: 'notes.txt，文件' }))
    await user.click(screen.getByRole('menuitem', { name: '删除所选 (2)' }))

    expect(await screen.findByText('将删除本地已选 2 个条目，其中 1 个目录会递归删除，此操作不可撤销。')).toBeInTheDocument()
  })
})
