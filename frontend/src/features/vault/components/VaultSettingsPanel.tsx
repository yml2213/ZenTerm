import {
  ArrowLeft,
  Cloud,
  Database,
  Download,
  Palette,
  Settings2,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import type { ChangeMasterForm } from '../vaultTypes'
import SecuritySection from '../settings/SecuritySection'
import SyncSection from '../settings/SyncSection'
import UpdatesSection from '../settings/UpdatesSection'
import TerminalSection from '../settings/TerminalSection'
import DataSection from '../settings/DataSection'
import AppearanceSection from '../settings/AppearanceSection'
import AdvancedSection from '../settings/AdvancedSection'

type SettingsSection = 'security' | 'sync' | 'updates' | 'terminal' | 'data' | 'appearance' | 'advanced'

interface VaultSettingsPanelProps {
  changeForm: ChangeMasterForm
  changeBusy: boolean
  resetConfirmed: boolean
  resetBusy: boolean
  onChangeField: (field: keyof ChangeMasterForm, value: string) => void
  onChangePassword: (event: FormEvent) => void
  onResetConfirmedChange: (value: boolean) => void
  onResetVault: () => void
  onBackToApp: () => void
}

const settingsNavGroups: Array<{
  groupTitle: string
  items: Array<{
    id: SettingsSection
    label: string
    description: string
    icon: typeof ShieldCheck
    badgeClass: string
  }>
}> = [
  {
    groupTitle: '界面与外观',
    items: [
      { id: 'appearance', label: '外观', description: '主题与密度', icon: Palette, badgeClass: 'badge-purple' },
      { id: 'terminal', label: '终端', description: '右键复制与粘贴', icon: TerminalSquare, badgeClass: 'badge-cyan' },
    ],
  },
  {
    groupTitle: '连接与安全',
    items: [
      { id: 'security', label: '安全', description: '主密码与本机钥匙串', icon: ShieldCheck, badgeClass: 'badge-emerald' },
      { id: 'sync', label: '同步', description: 'WebDAV 与坚果云', icon: Cloud, badgeClass: 'badge-sky' },
      { id: 'data', label: '数据', description: '导入、导出与状态', icon: Database, badgeClass: 'badge-amber' },
    ],
  },
  {
    groupTitle: '系统与关于',
    items: [
      { id: 'updates', label: '更新', description: '版本检查与下载', icon: Download, badgeClass: 'badge-indigo' },
      { id: 'advanced', label: '高级', description: '启动与调试', icon: Settings2, badgeClass: 'badge-slate' },
    ],
  },
]

const allSettingsSections = settingsNavGroups.flatMap((group) => group.items)

export default function VaultSettingsPanel({
  changeForm,
  changeBusy,
  resetConfirmed,
  resetBusy,
  onChangeField,
  onChangePassword,
  onResetConfirmedChange,
  onResetVault,
  onBackToApp,
}: VaultSettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('security')

  const activeMeta = useMemo(
    () => allSettingsSections.find((item) => item.id === activeSection) || allSettingsSections[0],
    [activeSection],
  )

  return (
    <section className="settings-stage" aria-label="设置">
      <aside className="settings-nav-panel" aria-label="设置分类">
        <button type="button" className="settings-back-button" onClick={onBackToApp}>
          <ArrowLeft size={15} />
          <span>返回应用</span>
          <kbd className="settings-back-kbd">ESC</kbd>
        </button>

        <div className="settings-nav-head">
          <span className="panel-kicker">Preferences</span>
          <h1>偏好设置</h1>
        </div>

        <div className="settings-nav-list">
          {settingsNavGroups.map((group) => (
            <div key={group.groupTitle} className="settings-nav-group">
              <span className="settings-nav-group-title">{group.groupTitle}</span>
              {group.items.map((item) => {
                const Icon = item.icon
                const active = activeSection === item.id
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`settings-nav-item${active ? ' active' : ''}`}
                    onClick={() => setActiveSection(item.id)}
                  >
                    <span className={`settings-nav-badge ${item.badgeClass}`} aria-hidden="true">
                      <Icon size={15} />
                    </span>
                    <span className="settings-nav-copy">
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </aside>

      <main className="settings-detail">
        <div className="settings-container">
          <header className="settings-detail-head">
            <span className="panel-kicker">{activeMeta.description}</span>
            <h2>{activeMeta.label}</h2>
          </header>

          <div className="settings-content-body">
            {activeSection === 'security' ? (
              <SecuritySection
                changeForm={changeForm}
                changeBusy={changeBusy}
                resetConfirmed={resetConfirmed}
                resetBusy={resetBusy}
                onChangeField={onChangeField}
                onChangePassword={onChangePassword}
                onResetConfirmedChange={onResetConfirmedChange}
                onResetVault={onResetVault}
              />
            ) : activeSection === 'sync' ? (
              <SyncSection />
            ) : activeSection === 'updates' ? (
              <UpdatesSection />
            ) : activeSection === 'terminal' ? (
              <TerminalSection />
            ) : activeSection === 'data' ? (
              <DataSection />
            ) : activeSection === 'appearance' ? (
              <AppearanceSection />
            ) : activeSection === 'advanced' ? (
              <AdvancedSection />
            ) : null}
          </div>
        </div>
      </main>
    </section>
  )
}
