import {
  ArrowLeft,
  ChevronRight,
  MonitorSmartphone,
  Plus,
  Server,
  X,
} from 'lucide-react'
import { useCallback, useState } from 'react'
import FilePane from './components/FilePane'
import PaneEmptyState from './components/PaneEmptyState'
import SftpContextMenuController, { type ExtendedContextMenuState } from './components/SftpContextMenuController'
import SftpDialogController from './components/SftpDialogController'
import SftpHostSwitcher from './components/SftpHostSwitcher'
import { useSftpDialogs } from './components/useSftpDialogs'
import { useSftpListing } from './components/useSftpListing'
import { useSftpSelection } from './components/useSftpSelection'
import { useSftpTransfer } from './components/useSftpTransfer'
import {
  findSelectedEntries,
  splitLocalPath,
  splitRemotePath,
  type ContextMenuState,
} from './sftpUtils'

import { cmd } from '@/lib/backendModels'

type Host = cmd.Host

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
  const closeContextMenu = useCallback(() => setContextMenu(null), [])
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
    openExtractArchive,
    openCompressEntry,
    openUploadFolderDialog,
    closeDialog,
    changeDialogValue,
  } = useSftpDialogs({
    localListing,
    remoteListing,
    closeContextMenu,
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
	  handleCancelTransfer,
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

    if (action === 'extract') {
      if (contextMenu.entry) {
        openExtractArchive(contextMenu.scope, contextMenu.entry, false)
      }
      return
    }

    if (action === 'extract-subfolder') {
      if (contextMenu.entry) {
        openExtractArchive(contextMenu.scope, contextMenu.entry, true)
      }
      return
    }

    if (action === 'compress-targz') {
      if (contextMenu.entry) {
        openCompressEntry(contextMenu.scope, contextMenu.entry, 'tar.gz')
      }
      return
    }

    if (action === 'compress-zip') {
      if (contextMenu.entry) {
        openCompressEntry(contextMenu.scope, contextMenu.entry, 'zip')
      }
      return
    }

    if (action === 'toggle-hidden-files') {
      toggleHiddenFiles(contextMenu.scope)
      setContextMenu(null)
    }
  }

  function openContextMenu(nextState: Omit<ContextMenuState, 'useSelectionActions' | 'selectionCount' | 'transferLabel' | 'canTransferSelection' | 'canClearSelection' | 'canDeleteSelection' | 'deleteSelectionLabel' | 'hiddenFilesLabel'>) {
    const scope = nextState.scope
    const selectedPaths = scope === 'remote' ? selectedRemotePaths : selectedLocalPaths
    const isTargetSelected = nextState.entry ? selectedPaths.includes(nextState.entry.path) : false
    const keepBatchSelection = isTargetSelected && selectedPaths.length > 1
    const selectedEntries = scope === 'remote'
      ? findSelectedEntries(getVisibleListing('remote'), selectedRemotePaths)
      : findSelectedEntries(getVisibleListing('local'), selectedLocalPaths)
    const transferableEntries = selectedEntries.filter((entry) => !entry.isDir)

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
      {transferBusy || notice?.message ? (
        <div className="sftp-transfer-banner">
          {transferBusy ? (
            <>
              <span className="pill subtle" aria-live="polite">正在{transferBusy === 'upload' ? '上传文件' : '下载文件'}...</span>
              <button type="button" className="sftp-transfer-cancel" onClick={handleCancelTransfer} aria-label="取消文件传输" title="取消文件传输">
                <X size={15} />
              </button>
            </>
          ) : (
            <span className={`pill ${notice?.tone || 'success'}`} aria-live="polite">{notice?.message}</span>
          )}
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
          onUploadFolder={openUploadFolderDialog}
          onExtractArchive={(entry) => openExtractArchive('local', entry, false)}
          onCompressEntry={(entry) => openCompressEntry('local', entry, 'tar.gz')}
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
              headerActions={(
                <SftpHostSwitcher
                  hosts={hosts}
                  selectedHost={selectedHost}
                  onChooseHost={onChooseHost}
                />
              )}
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
              onExtractArchive={(entry) => openExtractArchive('remote', entry, false)}
              onCompressEntry={(entry) => openCompressEntry('remote', entry, 'tar.gz')}
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
            description="从已保存主机建立连接后，右侧会显示远端目录并支持上传下载。"
            actions={(
              <div className="sftp-empty-actions">
                {hosts.length > 0 ? (
                  <button type="button" className="primary-button" onClick={() => onChooseHost()}>
                    <Server size={15} />
                    <span>选择主机</span>
                  </button>
                ) : (
                  <button type="button" className="primary-button" onClick={onCreateHost}>
                    <Plus size={15} />
                    <span>新建主机</span>
                  </button>
                )}
                <button type="button" className="ghost-button" onClick={onBackToVaults}>
                  <ArrowLeft size={15} />
                  <span>返回 Vaults</span>
                </button>
              </div>
            )}
            extra={hosts.length > 0 ? (
              <div className="sftp-host-picker-panel">
                <div className="sftp-host-picker-head">
                  <span>可用主机</span>
                  <small>{hosts.length} 台</small>
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
                        <span className="sftp-host-chip-main">
                          <Server size={14} />
                          <span className="sftp-host-chip-copy">
                            <strong>{host.name || host.id}</strong>
                            <small>{host.username}@{host.address}:{host.port || 22}</small>
                          </span>
                        </span>
                        <ChevronRight size={14} className="sftp-host-chip-arrow" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          />
        )}
      </div>

      <SftpContextMenuController
        state={contextMenu}
        onClose={closeContextMenu}
        onAction={handleContextAction}
      />

      <SftpDialogController
        state={dialogState}
        busy={dialogBusy}
        selectedHost={selectedHost}
        localListing={localListing}
        remoteListing={remoteListing}
        setBusy={setDialogBusy}
        setState={setDialogState}
        closeDialog={closeDialog}
        changeValue={changeDialogValue}
        executeTransfer={executeTransfer}
        handleLocalNavigate={handleLocalNavigate}
        handleRemoteNavigate={handleRemoteNavigate}
        clearScopeSelection={clearScopeSelection}
        setNotice={setNotice}
        onError={onError}
      />
    </section>
  )
}
