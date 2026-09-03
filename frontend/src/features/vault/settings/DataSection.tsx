import {
  Database,
  Download,
  ExternalLink,
  FolderOpen,
  HardDrive,
  History,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
} from "@/lib/backend";

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
      {/* 数据概览 */}
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Database size={18} />
          <div>
            <h3>数据概览</h3>
            <p>当前存储中的主机、凭据和会话记录统计。</p>
          </div>
        </div>

        <div className="data-stats-grid">
          <div className="data-stat-card">
            <HardDrive size={16} />
            <div>
              <strong>{stats ? formatBytes(stats.file_size) : "—"}</strong>
              <small>数据文件大小</small>
            </div>
          </div>
          <div className="data-stat-card">
            <Database size={16} />
            <div>
              <strong>{stats?.host_count ?? "—"}</strong>
              <small>主机</small>
            </div>
          </div>
          <div className="data-stat-card">
            <Database size={16} />
            <div>
              <strong>{stats?.credential_count ?? "—"}</strong>
              <small>凭据</small>
            </div>
          </div>
          <div className="data-stat-card">
            <History size={16} />
            <div>
              <strong>{stats?.session_log_count ?? "—"}</strong>
              <small>
                会话记录
                {stats && stats.transcript_bytes > 0
                  ? ` · 终端输出 ${formatBytes(stats.transcript_bytes)}`
                  : ""}
              </small>
            </div>
          </div>
        </div>

        <div className="settings-note-row">
          <FolderOpen size={16} />
          <span>
            <small className="data-path-text">
              {stats?.store_path || "读取中…"}
            </small>
          </span>
          <button
            type="button"
            className="ghost-button compact"
            onClick={handleOpenDir}
          >
            <ExternalLink size={14} />
            打开目录
          </button>
        </div>

        <div className="settings-action-grid data-export-actions">
          <button
            type="button"
            className={`ghost-button danger-outline${confirmClearLogs ? " confirm" : ""}`}
            onClick={() => {
              if (!confirmClearLogs) {
                setConfirmClearLogs(true);
                window.setTimeout(() => setConfirmClearLogs(false), 3000);
                return;
              }
              void handleClearSessionLogs();
            }}
            disabled={Boolean(busy) || (stats?.session_log_count ?? 0) === 0}
          >
            <Trash2 size={16} />
            {busy === "clear-logs"
              ? "清空中…"
              : confirmClearLogs
                ? "确认清空全部会话记录?"
                : "清空会话记录"}
          </button>
        </div>
      </section>

      {/* 导出与导入 */}
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Save size={18} />
          <div>
            <h3>导出与导入</h3>
            <p>
              导出的备份文件经过主密码加密，可安全存储或传输到其他设备。
            </p>
          </div>
        </div>

        <div className="settings-action-grid data-export-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={handleExport}
            disabled={Boolean(busy)}
          >
            <Download size={16} />
            {busy === "export" ? "导出中…" : "导出备份"}
          </button>
        </div>

        <div className="data-import-row">
          <label>
            主密码（解密备份）
            <input
              type="password"
              value={importPassword}
              onChange={(event) => setImportPassword(event.target.value)}
              placeholder="输入主密码以导入备份"
            />
          </label>
          <button
            type="button"
            className="ghost-button"
            onClick={handleImport}
            disabled={Boolean(busy) || !importPassword}
          >
            <Upload size={16} />
            {busy === "import" ? "导入中…" : "导入备份"}
          </button>
        </div>
      </section>

      {/* 本地备份 */}
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <History size={18} />
          <div>
            <h3>本地备份</h3>
            <p>同步拉取或手动操作时自动创建的备份文件。</p>
          </div>
        </div>

        {backups.length === 0 ? (
          <div className="data-backup-empty">
            <History size={20} />
            <span>暂无备份文件</span>
          </div>
        ) : (
          <div className="data-backup-list">
            {backups.map((backup) => (
              <div key={backup.path} className="data-backup-item">
                <div className="data-backup-info">
                  <strong>{backup.name}</strong>
                  <small>
                    {formatBytes(backup.size)} · {formatTime(backup.modified)}
                  </small>
                </div>
                <div className="data-backup-actions">
                  {restoreTarget === backup.path ? (
                    <div className="data-restore-inline">
                      <input
                        type="password"
                        value={restorePassword}
                        onChange={(event) =>
                          setRestorePassword(event.target.value)
                        }
                        placeholder="主密码"
                        className="data-restore-input"
                      />
                      <button
                        type="button"
                        className="primary-button compact"
                        onClick={() => handleRestore(backup.path)}
                        disabled={
                          Boolean(busy) || !restorePassword
                        }
                      >
                        {busy === `restore-${backup.path}`
                          ? "恢复中…"
                          : "确认"}
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact"
                        onClick={() => {
                          setRestoreTarget(null);
                          setRestorePassword("");
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
                        <RefreshCw size={14} />
                        恢复
                      </button>
                      <button
                        type="button"
                        className="ghost-button compact danger-outline"
                        onClick={() => handleDeleteBackup(backup.path)}
                        disabled={Boolean(busy)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          className="ghost-button compact"
          onClick={loadData}
          disabled={Boolean(busy)}
        >
          <RefreshCw size={14} />
          刷新列表
        </button>
      </section>

      {notice ? (
        <div className="settings-inline-message success">{notice}</div>
      ) : null}
      {error ? (
        <div className="settings-inline-message error">{error}</div>
      ) : null}
    </div>
  );
}

function getFileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
