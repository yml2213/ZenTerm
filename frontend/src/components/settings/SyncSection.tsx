import { Cloud, Database } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import {
  configureWebDAVSync,
  getWebDAVSyncStatus,
  pullWebDAVSync,
  pushWebDAVSync,
  testWebDAVSync,
  type WebDAVSyncStatus,
} from '../../lib/backend'

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
  const syncMetaText = [
    status?.device_name ? `设备 ${status.device_name}` : '',
    status?.last_sync_at ? `上次同步 ${status.last_sync_at}` : '尚未完成同步',
  ]
    .filter(Boolean)
    .join(' · ')

  useEffect(() => {
    let disposed = false
    getWebDAVSyncStatus()
      .then((nextStatus) => {
        if (disposed) {
          return
        }
        setStatus(nextStatus)
        if (nextStatus.url) {
          setURL(nextStatus.url)
        }
        if (nextStatus.username) {
          setUsername(nextStatus.username)
        }
        if (nextStatus.device_name) {
          setDeviceName(nextStatus.device_name)
        }
        if (nextStatus.remote_path) {
          setRemotePath(nextStatus.remote_path)
        }
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
        setNotice('WebDAV 同步配置已保存。')
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  function handleTest() {
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
        setNotice(result.message || (result.exists ? 'WebDAV 连接正常，远端同步文件已存在。' : 'WebDAV 连接正常。'))
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  function handlePush(overwrite = false) {
    setBusy(overwrite ? 'push-overwrite' : 'push')
    setError(null)
    setNotice(null)

    pushWebDAVSync(overwrite)
      .then((result) => {
        setNotice(result.message || '已上传本机快照。')
        return getWebDAVSyncStatus()
      })
      .then(setStatus)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  function handlePull(overwrite = false) {
    if (!masterPassword) {
      setError('请输入主密码后再拉取远端快照。')
      return
    }

    setBusy(overwrite ? 'pull-overwrite' : 'pull')
    setError(null)
    setNotice(null)

    pullWebDAVSync(masterPassword, overwrite)
      .then((result) => {
        setMasterPassword('')
        setNotice(result.message || '已拉取远端快照。')
        return getWebDAVSyncStatus()
      })
      .then(setStatus)
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setBusy(null))
  }

  return (
    <div className="settings-section-stack">
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Cloud size={18} />
          <div>
            <h3>WebDAV</h3>
            <p>适用于坚果云和兼容 WebDAV 的网盘。同步包会整体加密后再上传。</p>
          </div>
        </div>

        <div className="sync-status-strip">
          <span className={`sync-dot${status?.configured ? ' active' : ''}`} />
          <strong>{status?.configured ? '已配置' : '未配置'}</strong>
          <small>{syncMetaText}</small>
        </div>

        <form className="settings-form" onSubmit={handleConfigure}>
          <div className="settings-form-grid">
            <label>
              设备名称
              <input
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                placeholder="例如 MacBook Pro"
              />
            </label>
            <label>
              WebDAV 地址
              <input
                value={url}
                onChange={(event) => setURL(event.target.value)}
                placeholder="https://dav.jianguoyun.com/dav/"
                required
              />
            </label>
          </div>

          <div className="settings-form-grid">
            <label>
              用户名
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="坚果云账号"
                required
              />
            </label>
            <label>
              应用密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={status?.configured ? '留空则继续使用已保存密码' : '请输入第三方应用密码'}
                required={!status?.configured}
              />
            </label>
            <label>
              远端路径
              <input
                value={remotePath}
                onChange={(event) => setRemotePath(event.target.value)}
                placeholder="/ZenTerm/zenterm-sync-v1.json"
                required
              />
            </label>
          </div>

          <div className="settings-actions">
            <button type="button" className="ghost-button" onClick={handleTest} disabled={Boolean(busy)}>
              {busy === 'test' ? '测试中...' : '测试连接'}
            </button>
            <button type="submit" className="primary-button" disabled={Boolean(busy)}>
              {busy === 'config' ? '保存中...' : '保存配置'}
            </button>
          </div>
        </form>
      </section>

      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Database size={18} />
          <div>
            <h3>同步操作</h3>
            <p>默认同步主机和凭据，不同步完整终端记录。</p>
          </div>
        </div>

        <label>
          拉取时使用的主密码
          <input
            type="password"
            value={masterPassword}
            onChange={(event) => setMasterPassword(event.target.value)}
            placeholder="用于解密远端同步包"
          />
        </label>

        <div className="settings-action-grid">
          <button type="button" className="ghost-button" onClick={() => handlePull(false)} disabled={!status?.configured || Boolean(busy)}>
            {busy === 'pull' ? '拉取中...' : '拉取远端'}
          </button>
          <button type="button" className="ghost-button" onClick={() => handlePush(false)} disabled={!status?.configured || Boolean(busy)}>
            {busy === 'push' ? '上传中...' : '上传本机'}
          </button>
          <button type="button" className="ghost-button danger-outline" onClick={() => handlePush(true)} disabled={!status?.configured || Boolean(busy)}>
            覆盖远端
          </button>
          <button type="button" className="ghost-button danger-outline" onClick={() => handlePull(true)} disabled={!status?.configured || Boolean(busy)}>
            覆盖本机
          </button>
        </div>

        {notice ? <div className="settings-inline-message success">{notice}</div> : null}
        {error ? <div className="settings-inline-message error">{error}</div> : null}
      </section>
    </div>
  )
}
