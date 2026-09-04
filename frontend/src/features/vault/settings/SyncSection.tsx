import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Cloud,
  Database,
  Globe,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Smartphone,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  cancelWebDAVSync,
  configureWebDAVSync,
  getWebDAVSyncStatus,
  pullWebDAVSync,
  pushWebDAVSync,
  testWebDAVSync,
  type WebDAVSyncStatus,
} from '@/lib/backend'
import { SettingsGroup } from '../components/SettingsComponents'

export default function SyncSection() {
  const [status, setStatus] = useState<WebDAVSyncStatus | null>(null)
  const [deviceName, setDeviceName] = useState('')
  const [url, setURL] = useState('https://dav.jianguoyun.com/dav/')
  const [username, setUsername] = useState('')
  const [remotePath, setRemotePath] = useState('/ZenTerm/zenterm-sync-v1.json')
  const [password, setPassword] = useState('')
  const [masterPassword, setMasterPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const cancelRequestedRef = useRef(false)

  useEffect(() => {
    let disposed = false
    getWebDAVSyncStatus()
      .then((nextStatus) => {
        if (disposed) return
        setStatus(nextStatus)
        if (nextStatus.url) setURL(nextStatus.url)
        if (nextStatus.username) setUsername(nextStatus.username)
        if (nextStatus.device_name) setDeviceName(nextStatus.device_name)
        if (nextStatus.remote_path) setRemotePath(nextStatus.remote_path)
      })
      .catch((err) => {
        if (!disposed) {
          setError(err.message || String(err))
        }
      })

    return () => {
      disposed = true
    }
  }, [])

  function handleConfigure(event: FormEvent) {
    event.preventDefault()
    setBusy('config')
    setError(null)
    setNotice(null)

    configureWebDAVSync({
      url,
      username,
      remote_path: remotePath,
      device_name: deviceName,
      password,
    })
      .then((nextStatus) => {
        setStatus(nextStatus)
        setPassword('')
        setNotice('WebDAV 同步配置已成功保存。')
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  function handleTest() {
    cancelRequestedRef.current = false
    setBusy('test')
    setError(null)
    setNotice(null)

    testWebDAVSync({
      url,
      username,
      remote_path: remotePath,
      device_name: deviceName,
      password,
    })
      .then((result) => {
        setNotice(result.message || (result.exists ? 'WebDAV 连接测试通过，远端同步包已存在。' : 'WebDAV 连接测试通过。'))
      })
      .catch((err) => {
        if (cancelRequestedRef.current) {
          setNotice('WebDAV 操作已取消。')
          return
        }
        setError(err.message || String(err))
      })
      .finally(() => setBusy(null))
  }

  function handlePush(overwrite = false) {
    cancelRequestedRef.current = false
    setBusy(overwrite ? 'push-overwrite' : 'push')
    setError(null)
    setNotice(null)

    pushWebDAVSync(overwrite)
      .then((result) => {
        setNotice(result.message || '已成功上传本机快照至 WebDAV。')
        return getWebDAVSyncStatus()
      })
      .then(setStatus)
      .catch((err) => {
        if (cancelRequestedRef.current) {
          setNotice('WebDAV 操作已取消。')
          return
        }
        setError(err.message || String(err))
      })
      .finally(() => setBusy(null))
  }

  function handlePull(overwrite = false) {
    if (!masterPassword) {
      setError('请输入主密码后再解密拉取远端快照。')
      return
    }

    cancelRequestedRef.current = false
    setBusy(overwrite ? 'pull-overwrite' : 'pull')
    setError(null)
    setNotice(null)

    pullWebDAVSync(masterPassword, overwrite)
      .then((result) => {
        setMasterPassword('')
        setNotice(result.message || '已成功拉取远端快照并合并到本机。')
        return getWebDAVSyncStatus()
      })
      .then(setStatus)
      .catch((err) => {
        if (cancelRequestedRef.current) {
          setNotice('WebDAV 操作已取消。')
          return
        }
        setError(err.message || String(err))
      })
      .finally(() => setBusy(null))
  }

  function handleCancel() {
    cancelRequestedRef.current = true
    cancelWebDAVSync().catch((err) => {
      cancelRequestedRef.current = false
      setError(err.message || String(err))
    })
  }

  return (
    <div className="settings-section-stack">
      {/* 状态看板 */}
      <div className="sync-status-dashboard">
        <div className="sync-status-main">
          <div className="sync-status-indicator">
            <span className={`sync-pulse-dot${status?.configured ? ' is-active' : ''}`} />
            <div>
              <strong>{status?.configured ? 'WebDAV 云同步已就绪' : 'WebDAV 尚未配置'}</strong>
              <small>
                {status?.last_sync_at ? `上次同步于 ${status.last_sync_at}` : '尚未进行过云端数据同步'}
              </small>
            </div>
          </div>
          <div className="sync-status-tags">
            {status?.device_name && (
              <span className="sync-tag">
                <Smartphone size={12} />
                <span>{status.device_name}</span>
              </span>
            )}
            <span className={`sync-tag ${status?.configured ? 'success' : 'muted'}`}>
              <Globe size={12} />
              <span>{status?.configured ? '已连接' : '未连接'}</span>
            </span>
          </div>
        </div>
      </div>

      {/* WebDAV 账户与连接配置 */}
      <SettingsGroup
        title="WebDAV 云服务配置"
        description="支持坚果云、Nextcloud、ownCloud 及兼容标准 WebDAV 协议的网盘。全量数据均在本地经 AES-256-GCM 加密后再上传。"
      >
        <form className="settings-form" onSubmit={handleConfigure}>
          <div className="settings-form-grid">
            <div className="settings-form-field">
              <label className="settings-field-label">
                本设备标识
                <input
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.target.value)}
                  placeholder="例如 MacBook Pro"
                  className="settings-input"
                />
              </label>
            </div>
            <div className="settings-form-field">
              <label className="settings-field-label">
                WebDAV 服务器地址
                <input
                  value={url}
                  onChange={(event) => setURL(event.target.value)}
                  placeholder="https://dav.jianguoyun.com/dav/"
                  className="settings-input"
                  required
                />
              </label>
            </div>
          </div>

          <div className="settings-form-grid">
            <div className="settings-form-field">
              <label className="settings-field-label">
                账号 / 用户名
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="坚果云登录邮箱"
                  className="settings-input"
                  required
                />
              </label>
            </div>
            <div className="settings-form-field">
              <label className="settings-field-label">
                应用专属授权密码
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={status?.configured ? '留空则保持当前已保存密码' : '请输入第三方应用专属密码'}
                  className="settings-input"
                  required={!status?.configured}
                />
              </label>
            </div>
          </div>

          <div className="settings-form-field">
            <label className="settings-field-label">
              远端同步快照文件路径
              <input
                value={remotePath}
                onChange={(event) => setRemotePath(event.target.value)}
                placeholder="/ZenTerm/zenterm-sync-v1.json"
                className="settings-input"
                required
              />
            </label>
          </div>

          <div className="settings-actions-bar">
            <button
              type="button"
              className="ghost-button"
              onClick={handleTest}
              disabled={Boolean(busy)}
            >
              <Zap size={14} />
              {busy === 'test' ? '测试连通性...' : '测试连接'}
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={Boolean(busy)}
            >
              <Save size={14} />
              {busy === 'config' ? '保存配置中...' : '保存 WebDAV 配置'}
            </button>
          </div>
        </form>
      </SettingsGroup>

      {/* 同步操作 */}
      <SettingsGroup
        title="数据同步操作"
        description="默认同步加密的主机条目和私钥/密码凭据（不包含大体积会话终端屏幕回放日志）。"
      >
        <div className="sync-pull-master-field">
          <label className="settings-field-label">
            主密码（拉取远端快照时解密使用）
            <input
              type="password"
              value={masterPassword}
              onChange={(event) => setMasterPassword(event.target.value)}
              placeholder="请输入解密远端快照所需的主密码"
              className="settings-input"
            />
          </label>
        </div>

        <div className="sync-actions-panel">
          <div className="sync-actions-section">
            <span className="sync-section-subhead">增量同步 (推荐)</span>
            <div className="sync-buttons-grid">
              <button
                type="button"
                className="ghost-button sync-action-btn"
                onClick={() => handlePull(false)}
                disabled={!status?.configured || Boolean(busy)}
              >
                <ArrowDownToLine size={15} />
                <span>{busy === 'pull' ? '拉取中...' : '拉取远端并合并'}</span>
              </button>
              <button
                type="button"
                className="ghost-button sync-action-btn"
                onClick={() => handlePush(false)}
                disabled={!status?.configured || Boolean(busy)}
              >
                <ArrowUpFromLine size={15} />
                <span>{busy === 'push' ? '上传中...' : '上传本机快照'}</span>
              </button>
            </div>
          </div>

          <div className="sync-actions-section is-danger-section">
            <div className="sync-section-subhead danger-head">
              <AlertTriangle size={13} />
              <span>全量覆盖操作 (请谨慎)</span>
            </div>
            <div className="sync-buttons-grid">
              <button
                type="button"
                className="ghost-button danger-outline sync-action-btn"
                onClick={() => handlePush(true)}
                disabled={!status?.configured || Boolean(busy)}
              >
                <span>{busy === 'push-overwrite' ? '覆盖中...' : '强制覆盖远端'}</span>
              </button>
              <button
                type="button"
                className="ghost-button danger-outline sync-action-btn"
                onClick={() => handlePull(true)}
                disabled={!status?.configured || Boolean(busy)}
              >
                <span>{busy === 'pull-overwrite' ? '覆盖中...' : '强制覆盖本地'}</span>
              </button>
            </div>
          </div>
        </div>

        {busy && busy !== 'config' && (
          <div className="sync-cancel-row">
            <button
              type="button"
              className="ghost-button compact danger-outline"
              onClick={handleCancel}
            >
              <X size={14} />
              <span>取消正在进行的同步任务</span>
            </button>
          </div>
        )}
      </SettingsGroup>

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
