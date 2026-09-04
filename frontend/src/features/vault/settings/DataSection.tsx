import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  HardDrive,
  History,
  RefreshCw,
  Save,
  Server,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  deleteBackup,
  exportData,
  getDataStats,
  importData,
  listBackups,
  openStoreDirectory,
  restoreBackup,
  clearSessionLogs,
  type BackupEntry,
  type DataStats,
} from '@/lib/backend'
import { SettingsGroup } from '../components/SettingsComponents'

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function DataSettings() {
  const [stats, setStats] = useState<DataStats | null>(null);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [nextStats, nextBackups] = await Promise.all([
        getDataStats(),
        listBackups(),
      ]);
      setStats(nextStats);
      setBackups(nextBackups);
    } catch (err) {
      setError((err as Error).message || String(err));
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleExport() {
    setBusy("export");
    setError(null);
    setNotice(null);

    try {
      const path = await exportData();
      if (path) {
        setNotice(`已导出到 ${getFileName(path)}`);
      }
    } catch (err) {
      setError((err as Error).message || String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (!importPassword) {
      setError("请输入主密码以解密备份文件。");
      return;
    }

    setBusy("import");
    setError(null);
    setNotice(null);

    try {
      const path = await importData(importPassword);
      if (path) {
        setNotice(`已从 ${getFileName(path)} 导入数据。`);
        setImportPassword("");
        await loadData();
      }
    } catch (err) {
      setError((err as Error).message || String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore(backupPath: string) {
    if (!restorePassword) {
      setError("请输入主密码以解密备份。");
      return;
    }

    setBusy(`restore-${backupPath}`);
    setError(null);
    setNotice(null);

    try {
      await restoreBackup(backupPath, restorePassword);
      setNotice("已从备份恢复数据。");
      setRestorePassword("");
      setRestoreTarget(null);
      await loadData();
    } catch (err) {
      setError((err as Error).message || String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDeleteBackup(backupPath: string) {
    setBusy(`delete-${backupPath}`);
    setError(null);
    setNotice(null);

    try {
      await deleteBackup(backupPath);
      setNotice("已删除备份文件。");
      await loadData();
    } catch (err) {
      setError((err as Error).message || String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleOpenDir() {
    try {
      await openStoreDirectory();
    } catch (err) {
      setError((err as Error).message || String(err));
    }
  }

  async function handleClearSessionLogs() {
    setBusy("clear-logs");
    setError(null);
    setNotice(null);
    try {
      await clearSessionLogs();
      setNotice("已清空全部会话记录与终端输出。");
      setConfirmClearLogs(false);
      await loadData();
    } catch (err) {
      setError((err as Error).message || String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="settings-section-stack">
      {/* 数据指标 KPI 概览 */}
      <div className="data-kpi-grid">
        <div className="data-kpi-card">
          <div className="data-kpi-icon kpi-blue">
            <HardDrive size={18} />
          </div>
          <div className="data-kpi-body">
            <span className="data-kpi-val">{stats ? formatBytes(stats.file_size) : '—'}</span>
            <span className="data-kpi-lbl">配置数据库大小</span>
          </div>
        </div>

        <div className="data-kpi-card">
          <div className="data-kpi-icon kpi-emerald">
            <Server size={18} />
          </div>
          <div className="data-kpi-body">
            <span className="data-kpi-val">{stats?.host_count ?? '—'}</span>
            <span className="data-kpi-lbl">已保存主机</span>
          </div>
        </div>

        <div className="data-kpi-card">
          <div className="data-kpi-icon kpi-purple">
            <Database size={18} />
          </div>
          <div className="data-kpi-body">
            <span className="data-kpi-val">{stats?.credential_count ?? '—'}</span>
            <span className="data-kpi-lbl">已加密凭据</span>
          </div>
        </div>

        <div className="data-kpi-card">
          <div className="data-kpi-icon kpi-amber">
            <History size={18} />
          </div>
          <div className="data-kpi-body">
            <span className="data-kpi-val">{stats?.session_log_count ?? '—'}</span>
            <span className="data-kpi-lbl">
              连接日志
              {stats && stats.transcript_bytes > 0
                ? ` (${formatBytes(stats.transcript_bytes)})`
                : ''}
            </span>
          </div>
        </div>
      </div>

      {/* 存储路径 */}
      <SettingsGroup
        title="数据存储位置"
        description="所有主机、分组、凭据及已知指纹均加密保存在本机专属配置目录中。"
      >
        <div className="data-path-box">
          <div className="data-path-info">
            <FolderOpen size={16} />
            <code className="data-path-code">{stats?.store_path || '正在读取路径…'}</code>
          </div>
          <button
            type="button"
            className="ghost-button compact"
            onClick={handleOpenDir}
          >
            <ExternalLink size={14} />
            <span>打开存储目录</span>
          </button>
        </div>
      </SettingsGroup>

      {/* 数据导出与导入 */}
      <SettingsGroup
        title="全量数据备份与迁移"
        description="导出的数据备份经过主密码 AES-GCM 高强度加密，可安全传输到新电脑或作为灾备。"
      >
        <div className="data-migration-grid">
          <div className="data-migration-card">
            <div className="data-migration-info">
              <Download size={18} />
              <div>
                <strong>导出加密备份</strong>
                <p>将当前保险箱的所有主机、钥匙串与配置导出为独立的加密文件。</p>
              </div>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={handleExport}
              disabled={Boolean(busy)}
            >
              <Download size={14} />
              <span>{busy === 'export' ? '正在导出…' : '导出备份文件'}</span>
            </button>
          </div>

          <div className="data-migration-card">
            <div className="data-migration-info">
              <Upload size={18} />
              <div>
                <strong>导入加密备份</strong>
                <p>选择备份文件并输入原主密码，解密后导入到当前保险箱。</p>
              </div>
            </div>
            <div className="data-import-form">
              <input
                type="password"
                value={importPassword}
                onChange={(event) => setImportPassword(event.target.value)}
                placeholder="请输入用于解密备份的主密码"
                className="settings-input"
              />
              <button
                type="button"
                className="ghost-button"
                onClick={handleImport}
                disabled={Boolean(busy) || !importPassword}
              >
                <Upload size={14} />
                <span>{busy === 'import' ? '导入中…' : '选择文件并导入'}</span>
              </button>
            </div>
          </div>
        </div>
      </SettingsGroup>

      {/* 本地快照历史 */}
      <SettingsGroup
        title="本地备份历史"
        description="系统在执行云端同步拉取或重要变更时自动生成的安全恢复点。"
      >
        {backups.length === 0 ? (
          <div className="data-backup-empty">
            <History size={20} />
            <span>暂无本地快照备份文件</span>
          </div>
        ) : (
          <div className="data-backup-timeline">
            {backups.map((backup) => (
              <div key={backup.path} className="data-backup-row">
                <div className="data-backup-main">
                  <div className="data-backup-dot" />
                  <div className="data-backup-details">
                    <strong className="data-backup-name">{backup.name}</strong>
                    <span className="data-backup-meta">
                      {formatBytes(backup.size)} · {formatTime(backup.modified)}
                    </span>
                  </div>
                </div>

                <div className="data-backup-ctrls">
                  {restoreTarget === backup.path ? (
                    <div className="data-restore-active-box">
                      <input
                        type="password"
                        value={restorePassword}
                        onChange={(event) => setRestorePassword(event.target.value)}
                        placeholder="请输入主密码解密"
                        className="settings-input compact-input"
                      />
                      <button
                        type="button"
                        className="primary-button compact"
                        onClick={() => handleRestore(backup.path)}
                        disabled={Boolean(busy) || !restorePassword}
                      >
                        {busy === `restore-${backup.path}` ? '恢复中…' : '确认恢复'}
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact"
                        onClick={() => {
                          setRestoreTarget(null)
                          setRestorePassword('')
                        }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ghost-button compact"
                        onClick={() => setRestoreTarget(backup.path)}
                        disabled={Boolean(busy)}
                      >
                        <RefreshCw size={13} />
                        <span>恢复</span>
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact danger-outline"
                        onClick={() => handleDeleteBackup(backup.path)}
                        disabled={Boolean(busy)}
                        title="删除该备份"
                        aria-label="删除该备份"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="data-backup-foot">
          <button
            type="button"
            className="ghost-button compact"
            onClick={loadData}
            disabled={Boolean(busy)}
          >
            <RefreshCw size={13} />
            <span>刷新备份列表</span>
          </button>
        </div>
      </SettingsGroup>

      {/* 清理日志区域 */}
      <div className="settings-danger-card compact-danger">
        <div className="settings-danger-header">
          <Trash2 size={16} />
          <div>
            <h3>清理会话历史记录</h3>
            <p>清空全部保存在本地的 SSH 会话连接记录与终端屏幕转储输出，释放存储空间。</p>
          </div>
        </div>
        <div className="danger-actions-row">
          <button
            type="button"
            className={`ghost-button danger-outline${confirmClearLogs ? ' confirm' : ''}`}
            onClick={() => {
              if (!confirmClearLogs) {
                setConfirmClearLogs(true)
                window.setTimeout(() => setConfirmClearLogs(false), 3000)
                return
              }
              void handleClearSessionLogs()
            }}
            disabled={Boolean(busy) || (stats?.session_log_count ?? 0) === 0}
          >
            <Trash2 size={14} />
            <span>
              {busy === 'clear-logs'
                ? '正在清理中…'
                : confirmClearLogs
                  ? '确定清空全部会话记录？'
                  : '清空全部会话记录'}
            </span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="settings-inline-message success">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="settings-inline-message error">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

function getFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
