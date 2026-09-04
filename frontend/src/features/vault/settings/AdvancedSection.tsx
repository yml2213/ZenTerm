import {
  ExternalLink,
  Github,
  Sliders,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getAppPreferences,
  getAppVersion,
  saveAppPreferences,
  browserOpenURL,
  type AppPreferences,
} from '@/lib/backend'
import {
  SettingsGroup,
  SettingsRow,
} from '../components/SettingsComponents'

const GITHUB_URL = 'https://github.com/yml2213/ZenTerm'

export default function AdvancedSettings() {
  const [prefs, setPrefs] = useState<AppPreferences>({})
  const [appVersion, setAppVersion] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const [prefsData, version] = await Promise.all([
        getAppPreferences(),
        getAppVersion(),
      ])
      setPrefs(prefsData)
      setAppVersion(version)
    } catch (e) {
      console.error('Failed to load data:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleToggle = async (
    key:
      | 'open_inspector_on_startup'
      | 'record_session_transcripts'
      | 'disable_editor_backup',
    value: boolean,
  ) => {
    const newPrefs = { ...prefs, [key]: value }
    setPrefs(newPrefs)
    try {
      await saveAppPreferences(newPrefs)
    } catch (e) {
      console.error('Failed to save preferences:', e)
      setPrefs(prefs)
    }
  }

  const handleRetentionLimitChange = async (value: number) => {
    const nextValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
    const newPrefs = { ...prefs, session_log_retention_limit: nextValue }
    setPrefs(newPrefs)
    try {
      await saveAppPreferences(newPrefs)
    } catch (e) {
      console.error('Failed to save preferences:', e)
      setPrefs(prefs)
    }
  }

  if (loading) {
    return (
      <div className="settings-loading-state">
        <span className="settings-spinner" />
        <span>正在读取高级配置…</span>
      </div>
    )
  }

  return (
    <div className="settings-section-stack">
      {/* SFTP 编辑行为 */}
      <SettingsGroup
        title="文件编辑与保护"
        description="控制内置 SFTP 代码/文本编辑器在保存远端文件时的备份策略。"
      >
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={!(prefs.disable_editor_backup || false)}
            onChange={(e) =>
              handleToggle('disable_editor_backup', !e.target.checked)
            }
            className="settings-switch-native"
          />
          <div className="settings-toggle-copy">
            <strong>保存前自动备份原文件</strong>
            <small>
              编辑保存前在同目录生成「文件名.bak」，改错了可手动改回；每次保存会覆盖旧备份。备份失败时中止保存。
            </small>
          </div>
          <span
            className={`settings-switch-track${
              !prefs.disable_editor_backup ? ' is-checked' : ''
            }`}
            aria-hidden="true"
          >
            <span className="settings-switch-thumb" />
          </span>
        </label>
      </SettingsGroup>

      {/* 会话日志记录 */}
      <SettingsGroup
        title="连接历史与回放"
        description="控制 SSH 连接历史的留存规模与终端输出录制策略。"
      >
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={prefs.record_session_transcripts || false}
            onChange={(e) =>
              handleToggle('record_session_transcripts', e.target.checked)
            }
            className="settings-switch-native"
          />
          <div className="settings-toggle-copy">
            <strong>记录终端输出</strong>
            <small>开启时将终端输出分块加密保存在本地；关闭时仅保存连接元数据（主机、用户、时间）。</small>
          </div>
          <span
            className={`settings-switch-track${
              prefs.record_session_transcripts ? ' is-checked' : ''
            }`}
            aria-hidden="true"
          >
            <span className="settings-switch-thumb" />
          </span>
        </label>

        <SettingsRow
          icon={Sliders}
          title="最多保留连接日志"
          description="超出条数后会自动归档淘汰较旧的会话记录。设置为 0 时永久保留不自动清理。"
        >
          <div className="settings-number-stepper">
            <input
              type="number"
              min={0}
              max={5000}
              step={50}
              value={prefs.session_log_retention_limit ?? 200}
              onChange={(e) =>
                handleRetentionLimitChange(Number(e.target.value))
              }
              className="settings-input stepper-input"
            />
            <span className="stepper-unit">条</span>
          </div>
        </SettingsRow>
      </SettingsGroup>

      {/* 开发者与调试 */}
      <SettingsGroup
        title="开发者与调试工具"
        description="仅在需要审查 DOM、排查前端网络请求或调试时使用。"
      >
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={prefs.open_inspector_on_startup || false}
            onChange={(e) =>
              handleToggle('open_inspector_on_startup', e.target.checked)
            }
            className="settings-switch-native"
          />
          <div className="settings-toggle-copy">
            <strong>启动时打开 Inspector</strong>
            <small>应用启动时自动开启 WebKit 开发者调试面板。</small>
          </div>
          <span
            className={`settings-switch-track${
              prefs.open_inspector_on_startup ? ' is-checked' : ''
            }`}
            aria-hidden="true"
          >
            <span className="settings-switch-thumb" />
          </span>
        </label>
      </SettingsGroup>

      {/* 关于 ZenTerm 品牌展板 */}
      <div className="about-brand-card">
        <div className="about-brand-header">
          <div className="about-brand-icon-box">
            <img src="/icon-mark.svg" alt="ZenTerm Logo" className="about-brand-logo" />
          </div>
          <div className="about-brand-titles">
            <div className="about-brand-title-line">
              <h2>ZenTerm</h2>
              <span className="about-brand-version">
                v{appVersion || '0.1.8'}
              </span>
              <span className="about-brand-tag">Stable</span>
            </div>
            <p className="about-brand-desc">
              现代化桌面 SSH 终端与 SFTP 文件传输工作台，极简优雅、本地安全加密。
            </p>
          </div>
        </div>

        <div className="about-brand-tech-stack">
          <span className="about-tech-chip">Go 1.26</span>
          <span className="about-tech-chip">Wails v2</span>
          <span className="about-tech-chip">React 19</span>
          <span className="about-tech-chip">TypeScript 6</span>
          <span className="about-tech-chip">xterm.js</span>
          <span className="about-tech-chip">AES-GCM-256</span>
        </div>

        <div className="about-brand-actions">
          <button
            type="button"
            className="ghost-button compact"
            onClick={() => browserOpenURL(GITHUB_URL)}
          >
            <Github size={14} />
            <span>GitHub 仓库</span>
            <ExternalLink size={12} />
          </button>
        </div>

        <div className="about-brand-footer">
          <span>© {new Date().getFullYear()} ZenTerm Project · 基于 MIT 开放源代码协议发布</span>
        </div>
      </div>
    </div>
  )
}
