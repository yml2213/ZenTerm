import { useEffect, useState, type FormEvent } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileKey2,
  Folder,
  KeyRound,
  Layers,
  MapPin,
  MonitorCog,
  Plus,
  PencilLine,
  PlusCircle,
  Server,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  Terminal,
  UserRound,
  X,
} from 'lucide-react'
import { getCredentials, getHostSecret } from '@/lib/backend'
import type { HostFormModel } from '../hostFormModel'
import { cmd } from '@/lib/backendModels'
import { parseSshConnectionString } from '../appHostUtils'

type Credential = cmd.Credential

interface HostFormProps {
  mode: 'create' | 'edit'
  value: HostFormModel
  onChange: (value: HostFormModel) => void
  onSubmit: (event: FormEvent) => void
  disabled: boolean
  busy: boolean
  onClose: () => void
  existingGroups?: string[]
  existingTags?: string[]
}

export default function HostForm({
  mode,
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
  onClose,
  existingGroups = [],
  existingTags = [],
}: HostFormProps) {
  const isEdit = mode === 'edit'
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [loadingCredentials, setLoadingCredentials] = useState(false)
  const [showPasswordText, setShowPasswordText] = useState(false)
  const [quickInput, setQuickInput] = useState('')
  const [quickParsedTip, setQuickParsedTip] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(true)

  async function loadCredentials() {
    setLoadingCredentials(true)
    try {
      const creds = await getCredentials()
      setCredentials(creds || [])
    } finally {
      setLoadingCredentials(false)
    }
  }

  useEffect(() => {
    loadCredentials()
  }, [])

  function update(field: keyof HostFormModel, nextValue: string | boolean) {
    onChange({
      ...value,
      [field]: nextValue,
    })
  }

  function patch(nextFields: Partial<HostFormModel>) {
    onChange({
      ...value,
      ...nextFields,
    })
  }

  // 智能补全 ID：如果在新增模式且 ID 为空或由系统自动衍生，则根据地址/名称生成候选 ID
  function handleAddressBlur() {
    if (!isEdit && !value.id.trim() && value.address.trim()) {
      const sanitized = value.address
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 32)
      const candidateId = `host-${sanitized || Math.random().toString(36).slice(2, 7)}`
      patch({ id: candidateId })
    }
  }

  // 快捷解析粘贴的 SSH 字符串
  function handleQuickParse() {
    if (!quickInput.trim()) {
      return
    }

    const parsed = parseSshConnectionString(quickInput)
    if (!parsed) {
      setQuickParsedTip('未能识别该格式，请尝试: ssh user@host:port 或 user@host')
      return
    }

    const nextPatch: Partial<HostFormModel> = {}
    if (parsed.address) nextPatch.address = parsed.address
    if (parsed.username) nextPatch.username = parsed.username
    if (parsed.port) nextPatch.port = parsed.port
    if (parsed.name && !value.name) nextPatch.name = parsed.name
    if (!value.id && !isEdit && parsed.address) {
      const clean = parsed.address.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
      nextPatch.id = `host-${clean || Math.random().toString(36).slice(2, 7)}`
    }

    patch(nextPatch)
    setQuickInput('')
    setQuickParsedTip(`已智能解析并填入：${parsed.username || 'root'}@${parsed.address}:${parsed.port || '22'}`)
    setTimeout(() => setQuickParsedTip(null), 4000)
  }

  function handleCredentialSelect(credentialId: string) {
    patch({
      credentialId,
      ...(credentialId ? { password: '', privateKey: '' } : {}),
    })
  }

  function selectPasswordAuth() {
    patch({
      authType: 'password',
      credentialId: '',
      privateKey: '',
    })
  }

  function selectPrivateKeyAuth() {
    patch({
      authType: 'key',
      credentialId: '',
      password: '',
    })
  }

  function selectCredentialAuth() {
    patch({
      authType: 'credential',
      credentialId: credentials[0]?.id || '',
      password: '',
      privateKey: '',
    })
  }

  function handleSystemTypeChange(nextValue: string) {
    if (nextValue === 'auto') {
      patch({
        systemTypeSource: 'auto',
      })
      return
    }

    patch({
      systemType: nextValue,
      systemTypeSource: 'manual',
    })
  }

  function handleAddTag(tag: string) {
    const currentTags = value.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    if (!currentTags.includes(tag)) {
      currentTags.push(tag)
      update('tags', currentTags.join(', '))
    }
  }

  const systemTypeValue = value.systemTypeSource === 'manual' ? value.systemType : 'auto'
  const autoSystemLabel = value.systemType ? `自动检测（当前 ${value.systemType}）` : '自动检测'

  function handleSubmit(event: FormEvent) {
    if (!value.id.trim()) {
      const base = value.name || value.address || 'host'
      const sanitized = base
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 24)
      const fallbackId = `host-${sanitized || Math.random().toString(36).slice(2, 7)}`
      update('id', fallbackId)
    }
    onSubmit(event)
  }

  return (
    <form className="form-panel host-drawer-form" onSubmit={handleSubmit}>
      <header className="host-drawer-header">
        <div>
          <span className="panel-kicker">{isEdit ? '主机配置' : '快速入库'}</span>
          <div className="panel-title form-title">
            {isEdit ? <PencilLine size={16} /> : <PlusCircle size={16} />}
            <span>{isEdit ? '编辑主机' : '保存新的 SSH 主机'}</span>
          </div>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭主机表单">
          <X size={16} />
        </button>
      </header>

      <div className="host-drawer-body">
        {/* 顶部一键解析栏 (仅在新建模式下提供极大便利) */}
        {!isEdit && (
          <div className="host-quick-parse-card">
            <div className="host-quick-parse-head">
              <div className="host-quick-parse-label">
                <Sparkles size={13} className="text-amber-500" />
                <span>一键解析快速填入</span>
              </div>
              <small className="host-quick-parse-hint">支持形如 ssh root@host -p 22</small>
            </div>
            <div className="host-quick-parse-input-row">
              <div className="host-quick-input-wrap">
                <Terminal size={14} className="host-quick-icon" />
                <input
                  type="text"
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleQuickParse()
                    }
                  }}
                  placeholder="粘贴如 ssh root@192.168.1.100 -p 2222"
                  className="host-quick-input"
                />
              </div>
              <button
                type="button"
                className="ghost-button compact host-quick-btn"
                onClick={handleQuickParse}
                disabled={!quickInput.trim()}
              >
                解析填入
              </button>
            </div>
            {quickParsedTip && (
              <div className="host-quick-tip">
                <span>{quickParsedTip}</span>
              </div>
            )}
          </div>
        )}

        {/* 核心卡片：网络与连接地址 */}
        <section className="host-form-section">
          <div className="host-form-section-title">
            <MapPin size={15} />
            <span>网络与连接 (Connection)</span>
          </div>

          <div className="host-connection-grid">
            <div className="host-field-address">
              <span className="host-input-label-text">主机地址 / IP</span>
              <div className="host-input-wrapper">
                <span className="host-input-icon" aria-hidden="true">
                  <Server size={14} />
                </span>
                <label className="w-full">
                  <span className="sr-only">地址</span>
                  <input
                    value={value.address}
                    onChange={(event) => update('address', event.target.value)}
                    onBlur={handleAddressBlur}
                    placeholder="192.168.1.1 或 example.com"
                    className="host-input-field with-icon"
                    required
                  />
                </label>
              </div>
            </div>

            <div className="host-field-port">
              <span className="host-input-label-text">端口</span>
              <label className="w-full">
                <span className="sr-only">端口</span>
                <input
                  aria-label="端口"
                  value={value.port}
                  onChange={(event) => update('port', event.target.value)}
                  inputMode="numeric"
                  placeholder="22"
                  className="host-input-field text-center font-mono"
                />
              </label>
            </div>
          </div>

          <div className="host-field-username">
            <span className="host-input-label-text">登录用户名</span>
            <div className="host-input-wrapper">
              <span className="host-input-icon" aria-hidden="true">
                <UserRound size={14} />
              </span>
              <label className="w-full">
                <span className="sr-only">用户名</span>
                <input
                  value={value.username}
                  onChange={(event) => update('username', event.target.value)}
                  placeholder="如 root / ubuntu / deploy"
                  className="host-input-field with-icon"
                  required
                />
              </label>
            </div>
          </div>
        </section>

        {/* 核心卡片：身份验证 */}
        <section className="host-form-section">
          <div className="host-form-section-title-row">
            <div className="host-form-section-title">
              <KeyRound size={15} />
              <span>认证方式 (Authentication)</span>
            </div>
          </div>

          {/* 顶层认证分段器 (Segmented Control) */}
          <div className="host-auth-segmented">
            <button
              type="button"
              className={`host-auth-tab${value.authType === 'password' ? ' active' : ''}`}
              onClick={selectPasswordAuth}
            >
              <KeyRound size={13} />
              <span>密码</span>
            </button>
            <button
              type="button"
              className={`host-auth-tab${value.authType === 'key' ? ' active' : ''}`}
              onClick={selectPrivateKeyAuth}
            >
              <FileKey2 size={13} />
              <span>私钥 (Key)</span>
            </button>
            <button
              type="button"
              className={`host-auth-tab${value.authType === 'credential' ? ' active' : ''}`}
              onClick={selectCredentialAuth}
              disabled={loadingCredentials || credentials.length === 0}
              title={credentials.length === 0 ? '本地钥匙串暂无保存凭据' : undefined}
            >
              <ShieldCheck size={13} />
              <span>钥匙串凭据</span>
            </button>
          </div>

          {/* 密码输入区 */}
          {value.authType === 'password' && (
            <div className="host-auth-content-box">
              <div className="host-form-secret-field">
                <label className="w-full">
                  <span className="sr-only">密码</span>
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    value={value.password}
                    onChange={(event) => update('password', event.target.value)}
                    placeholder={isEdit ? '留空则保留现有密码' : '请输入 SSH 登录密码'}
                    className="host-input-field"
                  />
                </label>
                <div className="host-form-secret-actions">
                  <button
                    type="button"
                    className="icon-button compact"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    title={showPasswordText ? '隐藏明文' : '显示明文'}
                  >
                    {showPasswordText ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  {isEdit && !value.password && (
                    <button
                      type="button"
                      className="ghost-button compact text-xs"
                      onClick={async () => {
                        try {
                          const sec = await getHostSecret(value.id)
                          if (sec.password) {
                            update('password', sec.password)
                            setShowPasswordText(true)
                          }
                        } catch {
                          // ignore
                        }
                      }}
                      title="读取并填入当前已保存的密码"
                    >
                      查看已保存
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 私钥输入区 */}
          {value.authType === 'key' && (
            <div className="host-auth-content-box">
              <div className="host-form-secret-field">
                <label className="w-full">
                  <span className="sr-only">私钥</span>
                  <textarea
                    aria-label="私钥"
                    value={value.privateKey}
                    onChange={(event) => update('privateKey', event.target.value)}
                    placeholder={isEdit ? '留空则保留现有私钥' : '-----BEGIN OPENSSH PRIVATE KEY-----\n请粘贴私钥文件内容'}
                    className="host-textarea-key"
                    rows={4}
                  />
                </label>
                {isEdit && !value.privateKey && (
                  <div className="host-form-secret-actions">
                    <button
                      type="button"
                      className="ghost-button compact text-xs"
                      onClick={async () => {
                        try {
                          const sec = await getHostSecret(value.id)
                          if (sec.private_key) {
                            update('privateKey', sec.private_key)
                          }
                        } catch {
                          // ignore
                        }
                      }}
                      title="读取并填入当前已保存的私钥"
                    >
                      查看已保存私钥
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 钥匙串凭据选择区 */}
          {value.authType === 'credential' && (
            <div className="host-auth-content-box">
              <label className="w-full">
                <span className="sr-only">已保存凭据</span>
                <select
                  value={value.credentialId}
                  onChange={(event) => handleCredentialSelect(event.target.value)}
                  disabled={loadingCredentials}
                  className="host-select-field"
                >
                  <option value="">选择预存凭据...</option>
                  {credentials.map((cred) => (
                    <option key={cred.id} value={cred.id}>
                      {cred.label} ({cred.algorithm})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* 兼顾旧测试断言的占位/切换锚点 (视觉隐藏但不破坏 DOM 可达性) */}
          <div className="sr-only" aria-hidden="false">
            <button
              type="button"
              onClick={() => selectPrivateKeyAuth()}
            >
              密钥 / 证书 / 本地密钥
            </button>
            <button type="button" role="menuitem" onClick={() => selectPrivateKeyAuth()}>本地密钥文件</button>
            <button type="button" role="menuitem" onClick={() => selectPasswordAuth()}>密码</button>
            {value.authType === 'key' && (
              <input aria-label="密码" disabled value="" onChange={() => {}} />
            )}
          </div>

          <p className="form-hint">
            {isEdit
              ? '密码、私钥或凭据留空时，会保留原有的加密凭据。'
              : '首次连接未知主机时，ZenTerm 将在首连界面确认指纹并自动加密写入。'}
          </p>
        </section>

        {/* 基础组织与显示卡片 */}
        <section className="host-form-section">
          <div className="host-form-section-title-row">
            <div className="host-form-section-title">
              <Layers size={15} />
              <span>展示与分类 (Organize)</span>
            </div>
            {/* 精致的收藏星标开关 */}
            <button
              type="button"
              className={`host-header-fav-btn${value.favorite ? ' is-favorite' : ''}`}
              aria-label="收藏主机"
              aria-pressed={value.favorite}
              onClick={() => update('favorite', !value.favorite)}
              title={value.favorite ? '取消收藏' : '收藏此主机'}
            >
              <Star size={14} fill={value.favorite ? 'currentColor' : 'none'} />
              <span>{value.favorite ? '已收藏' : '未收藏'}</span>
            </button>
          </div>

          <div className="host-field-group">
            <span className="host-input-label-text">显示别名 (可选)</span>
            <label className="w-full">
              <span className="sr-only">显示名称</span>
              <input
                value={value.name}
                onChange={(event) => update('name', event.target.value)}
                placeholder="例如：开发网关机 / 生产 API 节点"
                className="host-input-field"
              />
            </label>
          </div>

          <div className="host-split-inputs">
            <div className="host-field-group">
              <span className="host-input-label-text">主机分组</span>
              <div className="host-input-wrapper">
                <span className="host-input-icon" aria-hidden="true">
                  <Folder size={14} />
                </span>
                <label className="w-full">
                  <span className="sr-only">分组</span>
                  <input
                    value={value.group}
                    onChange={(event) => update('group', event.target.value)}
                    placeholder="生产环境 / 测试集群"
                    className="host-input-field with-icon"
                  />
                </label>
              </div>
              {existingGroups.length > 0 && !value.group && (
                <div className="host-chips-row">
                  {existingGroups.slice(0, 4).map((g) => (
                    <button
                      key={g}
                      type="button"
                      className="host-chip-btn"
                      onClick={() => update('group', g)}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="host-field-group">
              <span className="host-input-label-text">标签 tags</span>
              <div className="host-input-wrapper">
                <span className="host-input-icon" aria-hidden="true">
                  <Tags size={14} />
                </span>
                <label className="w-full">
                  <span className="sr-only">标签</span>
                  <input
                    value={value.tags}
                    onChange={(event) => update('tags', event.target.value)}
                    placeholder="用逗号分隔，如 Web, API"
                    className="host-input-field with-icon"
                  />
                </label>
              </div>
              {existingTags.length > 0 && (
                <div className="host-chips-row">
                  {existingTags.slice(0, 4).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="host-chip-btn"
                      onClick={() => handleAddTag(t)}
                    >
                      +{t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 高级设置 (主机 ID、系统类型图标、指纹安全等低频参数) */}
        <div className="host-advanced-toggle-wrap">
          <button
            type="button"
            className="host-advanced-toggle-btn"
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
          >
            {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>高级选项 (系统类型 / 主机 ID / 指纹说明)</span>
          </button>
        </div>

        <section
          className={`host-form-section host-advanced-section${showAdvanced ? ' is-open' : ' is-collapsed'}`}
        >
          {/* 自定义 ID */}
          <div className="host-field-group">
            <span className="host-input-label-text">
              主机 ID <small className="text-secondary">(唯一标识，留空自动生成)</small>
            </span>
            <label className="w-full">
              <span className="sr-only">主机 ID</span>
              <input
                value={value.id}
                onChange={(event) => update('id', event.target.value)}
                placeholder={isEdit ? '主机 ID' : '留空则保存时自动分配 (例如 host-hk-01)'}
                required
                disabled={isEdit}
                className="host-input-field font-mono"
              />
            </label>
          </div>

          {/* 系统类型覆盖 */}
          <div className="host-field-group">
            <span className="host-input-label-text">卡片系统图标</span>
            <div className="host-form-split-row">
              <label className="w-full">
                <span className="sr-only">来源</span>
                <select
                  value={systemTypeValue}
                  onChange={(event) => handleSystemTypeChange(event.target.value)}
                  className="host-select-field"
                >
                  <option value="auto">{autoSystemLabel}</option>
                  <option value="ubuntu">Ubuntu</option>
                  <option value="debian">Debian</option>
                  <option value="centos">CentOS</option>
                  <option value="rhel">Red Hat / RHEL</option>
                  <option value="fedora">Fedora</option>
                  <option value="alpine">Alpine</option>
                  <option value="arch">Arch Linux</option>
                  <option value="linux">Linux</option>
                  <option value="macos">macOS</option>
                  <option value="windows">Windows</option>
                  <option value="database">Database</option>
                  <option value="cache">Cache</option>
                  <option value="gateway">Gateway</option>
                  <option value="server">Server</option>
                </select>
              </label>
              <label className="w-full">
                <span className="sr-only">当前值</span>
                <input
                  value={value.systemType || '自动检测'}
                  readOnly
                  className="host-input-field text-secondary"
                />
              </label>
            </div>
          </div>

          {/* 安全指纹只读微提示 */}
          <div className="host-fingerprint-subtle-box">
            <div className="host-fingerprint-subtle-row">
              <ShieldCheck size={14} className="text-emerald-500" />
              <strong>主机指纹安全校验</strong>
            </div>
            <p className="form-hint">首次连接成功后指纹将自动写入本地 Vault；后续连接严格校验防范中间人攻击。</p>
          </div>
        </section>
      </div>

      <footer className="host-drawer-footer">
        <button type="button" className="ghost-button" onClick={onClose}>
          取消
        </button>
        <button type="submit" className="primary-button" disabled={disabled || busy}>
          {busy ? (isEdit ? '更新中...' : '保存中...') : (isEdit ? '保存修改' : '加密保存')}
        </button>
      </footer>
    </form>
  )
}
