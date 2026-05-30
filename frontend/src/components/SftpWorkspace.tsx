import {
  MonitorSmartphone,
  Server,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import ContextMenu from './sftp/ContextMenu'
import EntryDialog from './sftp/EntryDialog'
import FilePane from './sftp/FilePane'
import PaneEmptyState from './sftp/PaneEmptyState'
import { useSftpDialogs } from './sftp/useSftpDialogs'
import { useSftpListing } from './sftp/useSftpListing'
import { useSftpSelection } from './sftp/useSftpSelection'
import { useSftpTransfer } from './sftp/useSftpTransfer'
import {
  createLocalDirectory,
  createRemoteDirectory,
  deleteLocalEntry,
  deleteRemoteEntry,
  renameLocalEntry,
  renameRemoteEntry,
} from '../lib/backend'
import {
  buildActionSuccessMessage,
  findSelectedEntries,
  pickTransferableEntries,
  splitLocalPath,
  splitRemotePath,
  type ContextMenuState,
} from '../lib/sftpUtils'
import { main } from '../wailsjs/wailsjs/go/models'

type Host = main.Host

interface ExtendedContextMenuState extends ContextMenuState {
  transferLabel?: string
  deleteSelectionLabel?: string
  hiddenFilesLabel?: string
}

interface SftpWorkspaceProps {
  hosts: Host[]
  selectedHost: Host | null
  vaultUnlocked: boolean
  onChooseHost: (hostId?: string | null) => void
  onCreateHost: () => void
  onBackToVaults: () => void
  onError: (message: string) => void
}

export default function SftpWorkspace({
  hosts,
  selectedHost,
  vaultUnlocked,
  onChooseHost,
  onCreateHost,
  onBackToVaults,
  onError,
}: SftpWorkspaceProps) {
  const [contextMenu, setContextMenu] = useState<ExtendedContextMenuState | null>(null)
  const {
    selectedLocalPath,
    selectedRemotePath,
    selectedLocalPaths,
    selectedRemotePaths,
    clearScopeSelection,
    selectOnlyPath,
    togglePathSelection,
    selectRange,
    toggleAllSelection,
  } = useSftpSelection()
  const {
    localListing,
    remoteListing,
    localLoading,
    remoteLoading,
    showHiddenLocalFiles,
    showHiddenRemoteFiles,
    localSort,
    remoteSort,
    toggleHiddenFiles,
    getShowHiddenState,
    getVisibleListing,
    updateSort,
    handleLocalNavigate,
    handleRemoteNavigate,
    refreshScope,
  } = useSftpListing({
    selectedHost,
    vaultUnlocked,
    onError,
    clearScopeSelection,
  })
  const {
    dialogState,
    dialogBusy,
    setDialogBusy,
    setDialogState,
    openCreateDirectory,
    openRenameEntry,
    openDeleteEntry,
    openDeleteSelection,
    openTransferConflictDialog,
    closeDialog,
    changeDialogValue,
  } = useSftpDialogs({
    localListing,
    remoteListing,
    closeContextMenu: () => setContextMenu(null),
  })
  const {
    transferBusy,
    notice,
    setNotice,
    selectedLocalTransferableEntries,
    selectedRemoteTransferableEntries,
    executeTransfer,
    handleUpload,
    handleDownload,
  } = useSftpTransfer({
    selectedHost,
    localListing,
    remoteListing,
    selectedLocalPaths,
    selectedRemotePaths,
    handleLocalNavigate,
    handleRemoteNavigate,
    clearScopeSelection,
    openTransferConflictDialog,
    closeDialog,
    onError,
  })

  useEffect(() => {
    if (!contextMenu) {
      return undefined
    }

    function closeMenu() {
      setContextMenu(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    window.addEventListener('click', closeMenu)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  async function handleDialogConfirm() {
    if (!dialogState) {
      return
    }

    const currentDialog = dialogState
    setDialogBusy(true)
    try {
      if (currentDialog.type === 'overwrite-transfer') {
        await executeTransfer(currentDialog.direction!, {
          sourcePaths: currentDialog.sourcePaths,
          targetDirectory: currentDialog.targetDirectory,
          startIndex: currentDialog.startIndex,
          completedCount: currentDialog.completedCount,
          overwriteCurrent: true,
        })
        return
      }

      if (currentDialog.type === 'mkdir') {
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) {
            return
          }
          await createRemoteDirectory(selectedHost.id, currentDialog.parentPath!, currentDialog.value!)
          await handleRemoteNavigate(currentDialog.parentPath!)
        } else {
          await createLocalDirectory(currentDialog.parentPath!, currentDialog.value!)
          await handleLocalNavigate(currentDialog.parentPath!)
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('mkdir', currentDialog.scope, { name: currentDialog.value!.trim() }),
        })
      }

      if (currentDialog.type === 'rename') {
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) {
            return
          }
          await renameRemoteEntry(selectedHost.id, currentDialog.entry!.path, currentDialog.value!)
          await handleRemoteNavigate(remoteListing?.path || '')
          clearScopeSelection('remote')
        } else {
          await renameLocalEntry(currentDialog.entry!.path, currentDialog.value!)
          await handleLocalNavigate(localListing?.path || '')
          clearScopeSelection('local')
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('rename', currentDialog.scope, {
            entry: currentDialog.entry!,
            name: currentDialog.value!.trim(),
          }),
        })
      }

      if (currentDialog.type === 'delete') {
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) {
            return
          }
          await deleteRemoteEntry(selectedHost.id, currentDialog.entry!.path)
          await handleRemoteNavigate(remoteListing?.path || '')
          clearScopeSelection('remote')
        } else {
          await deleteLocalEntry(currentDialog.entry!.path)
          await handleLocalNavigate(localListing?.path || '')
          clearScopeSelection('local')
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('delete', currentDialog.scope, { entry: currentDialog.entry! }),
        })
      }

      if (currentDialog.type === 'delete-batch') {
        if (currentDialog.scope === 'remote') {
          if (!selectedHost) {
            return
          }
          for (const entry of currentDialog.entries!) {
            await deleteRemoteEntry(selectedHost.id, entry.path)
          }
          await handleRemoteNavigate(remoteListing?.path || '')
          clearScopeSelection('remote')
        } else {
          for (const entry of currentDialog.entries!) {
            await deleteLocalEntry(entry.path)
          }
          await handleLocalNavigate(localListing?.path || '')
          clearScopeSelection('local')
        }

        setNotice({
          tone: 'success',
          message: buildActionSuccessMessage('delete-batch', currentDialog.scope, { count: currentDialog.entries!.length }),
        })
      }

      setDialogState(null)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setDialogBusy(false)
    }
  }

  function handleContextAction(action: string) {
    if (!contextMenu) {
      return
    }

    if (action === 'open' && contextMenu.entry?.isDir) {
      if (contextMenu.scope === 'remote') {
        handleRemoteNavigate(contextMenu.entry.path)
      } else {
        handleLocalNavigate(contextMenu.entry.path)
      }
      setContextMenu(null)
      return
    }

    if (action === 'refresh') {
      refreshScope(contextMenu.scope)
      setContextMenu(null)
      return
    }

    if (action === 'transfer') {
      if (contextMenu.scope === 'remote') {
        handleDownload()
      } else {
        handleUpload()
      }
      setContextMenu(null)
      return
    }

    if (action === 'clear-selection') {
      clearScopeSelection(contextMenu.scope)
      setContextMenu(null)
      return
    }

    if (action === 'mkdir') {
      openCreateDirectory(contextMenu.scope)
      return
    }

    if (action === 'rename') {
      openRenameEntry(contextMenu.scope, contextMenu.entry!)
      return
    }

    if (action === 'delete') {
      openDeleteEntry(contextMenu.scope, contextMenu.entry!)
      return
    }

    if (action === 'delete-selection') {
      const selectedEntries = contextMenu.scope === 'remote'
        ? findSelectedEntries(getVisibleListing('remote'), selectedRemotePaths)
        : findSelectedEntries(getVisibleListing('local'), selectedLocalPaths)
      openDeleteSelection(contextMenu.scope, selectedEntries)
      return
    }

    if (action === 'toggle-hidden-files') {
      toggleHiddenFiles(contextMenu.scope)
      setContextMenu(null)
    }
  }

  const remoteHostSwitcher = selectedHost ? (
    <div
      className="sftp-host-switcher-group"
      title={`${selectedHost.name || selectedHost.id} · ${selectedHost.username}@${selectedHost.address}:${selectedHost.port || 22}`}
    >
      <Server size={14} />
      {hosts.length > 1 ? (
        <label className="sftp-host-switcher">
          <select
            aria-label="切换 SFTP 主机"
            value={selectedHost.id}
            onChange={(event) => onChooseHost(event.target.value)}
          >
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.name || host.id}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="sftp-current-host-label">{selectedHost.name || selectedHost.id}</span>
      )}
      <button
        type="button"
        className="icon-button sftp-tab-close"
        aria-label="关闭远端"
        title="关闭远端"
        onClick={() => onChooseHost(null)}
      >
        <X size={14} />
      </button>
    </div>
  ) : null

  function openContextMenu(nextState: Omit<ContextMenuState, 'useSelectionActions' | 'selectionCount' | 'transferLabel' | 'canTransferSelection' | 'canClearSelection' | 'canDeleteSelection' | 'deleteSelectionLabel' | 'hiddenFilesLabel'>) {
    const scope = nextState.scope
    const selectedPaths = scope === 'remote' ? selectedRemotePaths : selectedLocalPaths
    const listing = getVisibleListing(scope)
    const selectedEntries = findSelectedEntries(listing, selectedPaths)
    const transferableEntries = pickTransferableEntries(listing, selectedPaths)
    const keepBatchSelection = selectedEntries.length > 1 && (!nextState.entry || selectedPaths.includes(nextState.entry.path))

    setContextMenu({
      ...nextState,
      useSelectionActions: keepBatchSelection,
      selectionCount: keepBatchSelection ? selectedEntries.length : 0,
      transferLabel: scope === 'remote'
        ? `下载所选 (${transferableEntries.length})`
        : `上传所选 (${transferableEntries.length})`,
      canTransferSelection: keepBatchSelection && transferableEntries.length > 0 && (
        scope === 'remote'
          ? Boolean(localListing?.path) && transferBusy === null
          : Boolean(selectedHost) && vaultUnlocked && transferBusy === null
      ),
      canClearSelection: keepBatchSelection,
      canDeleteSelection: keepBatchSelection,
      deleteSelectionLabel: `删除所选 (${selectedEntries.length})`,
      hiddenFilesLabel: getShowHiddenState(scope) ? '隐藏隐藏文件' : '显示隐藏文件',
    })
  }

  return (
    <section className="sftp-shell" aria-label="SFTP 工作区">
      {notice?.message ? (
        <div className="sftp-transfer-banner">
          <span className={`pill ${notice.tone || 'success'}`} aria-live="polite">{notice.message}</span>
        </div>
      ) : null}

      <div className="sftp-browser">
        <FilePane
          className="sftp-pane-local"
          scope="local"
          sourceLabel="Local"
          sourceIcon={MonitorSmartphone}
          listing={localListing}
          loading={localLoading}
          hostMeta="本机目录"
          showHiddenFiles={showHiddenLocalFiles}
          sort={localSort}
          onSortChange={(key) => updateSort('local', key)}
          onNavigate={handleLocalNavigate}
          onRefresh={() => handleLocalNavigate(localListing?.path || '')}
          breadcrumbItems={splitLocalPath(localListing?.path || '')}
          selectedPath={selectedLocalPath}
          selectedPaths={selectedLocalPaths}
          onSelectOnlyPath={(path) => selectOnlyPath('local', path)}
          onTogglePathSelection={(path) => togglePathSelection('local', path)}
          onSelectRange={(path, orderedPaths) => selectRange('local', path, orderedPaths)}
          onToggleAllSelection={() => toggleAllSelection('local', getVisibleListing('local'))}
          transferLabel={selectedHost ? '上传到远端' : null}
          transferBusy={transferBusy === 'upload'}
          transferDisabled={selectedLocalTransferableEntries.length === 0 || !selectedHost || !vaultUnlocked || transferBusy !== null}
          onTransfer={handleUpload}
          onCreateDirectory={() => openCreateDirectory('local')}
          onRenameEntry={(entry) => openRenameEntry('local', entry)}
          onDeleteEntry={(entry) => openDeleteEntry('local', entry)}
          onDeleteSelection={(entries) => openDeleteSelection('local', entries)}
          onClearSelection={() => clearScopeSelection('local')}
          onContextMenu={openContextMenu}
        />

        {selectedHost ? (
          vaultUnlocked ? (
            <FilePane
              className="sftp-pane-remote"
              scope="remote"
              sourceLabel="Remote"
              sourceIcon={Server}
              listing={remoteListing}
              loading={remoteLoading}
              hostLabel={selectedHost.name || selectedHost.id}
              hostMeta={`${selectedHost.username}@${selectedHost.address}:${selectedHost.port || 22}`}
              headerActions={remoteHostSwitcher}
              showHiddenFiles={showHiddenRemoteFiles}
              sort={remoteSort}
              onSortChange={(key) => updateSort('remote', key)}
              onNavigate={handleRemoteNavigate}
              onRefresh={() => handleRemoteNavigate(remoteListing?.path || '')}
              breadcrumbItems={splitRemotePath(remoteListing?.path || '/')}
              selectedPath={selectedRemotePath}
              selectedPaths={selectedRemotePaths}
              onSelectOnlyPath={(path) => selectOnlyPath('remote', path)}
              onTogglePathSelection={(path) => togglePathSelection('remote', path)}
              onSelectRange={(path, orderedPaths) => selectRange('remote', path, orderedPaths)}
              onToggleAllSelection={() => toggleAllSelection('remote', getVisibleListing('remote'))}
              transferLabel="下载到本地"
              transferBusy={transferBusy === 'download'}
              transferDisabled={selectedRemoteTransferableEntries.length === 0 || !localListing?.path || transferBusy !== null}
              onTransfer={handleDownload}
              onCreateDirectory={() => openCreateDirectory('remote')}
              onRenameEntry={(entry) => openRenameEntry('remote', entry)}
              onDeleteEntry={(entry) => openDeleteEntry('remote', entry)}
              onDeleteSelection={(entries) => openDeleteSelection('remote', entries)}
              onClearSelection={() => clearScopeSelection('remote')}
              onContextMenu={openContextMenu}
            />
          ) : (
            <PaneEmptyState
              sourceLabel="Remote"
              sourceIcon={Server}
              title="需要主密码"
              description="远端文件需要先完成一次主密码验证，才能使用已保存凭据建立 SFTP 连接。"
            />
          )
        ) : (
          <PaneEmptyState
            sourceLabel="Remote"
            sourceIcon={Server}
            title="先选择一个主机"
            description="选择要浏览的远端文件系统后，左右面板就会进入可传输的双栏工作区。"
            actions={(
              <div className="sftp-empty-actions">
                {hosts.length > 0 ? (
                  <button type="button" className="primary-button" onClick={() => onChooseHost()}>
                    选择主机
                  </button>
                ) : (
                  <button type="button" className="primary-button" onClick={onCreateHost}>
                    新建主机
                  </button>
                )}
                <button type="button" className="ghost-button" onClick={onBackToVaults}>
                  返回 Vaults
                </button>
              </div>
            )}
            extra={hosts.length > 0 ? (
              <div className="sftp-host-picker-panel">
                <div className="sftp-host-picker-meta">
                  已保存 {hosts.length} 台主机，可滚动查看更多。
                </div>
                <div className="sftp-host-picker-scroll" aria-label="SFTP 主机列表">
                  <div className="sftp-host-picker">
                    {hosts.map((host) => (
                      <button
                        key={host.id}
                        type="button"
                        className="sftp-host-chip"
                        onClick={() => onChooseHost(host.id)}
                      >
                        <span>{host.name || host.id}</span>
                        <small>{host.username}@{host.address}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          />
        )}
      </div>

      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        onAction={handleContextAction}
      />

      <EntryDialog
        state={dialogState}
        busy={dialogBusy}
        onClose={closeDialog}
        onConfirm={handleDialogConfirm}
        onChange={changeDialogValue}
      />
    </section>
  )
}
