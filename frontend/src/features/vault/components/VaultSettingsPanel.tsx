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

const settingsSections: Array<{
  id: SettingsSection
  label: string
  description: string
  icon: typeof ShieldCheck
}> = [
  { id: 'security', label: '安全', description: '主密码与本机钥匙串', icon: ShieldCheck },
  { id: 'sync', label: '同步', description: 'WebDAV 与坚果云', icon: Cloud },
  { id: 'updates', label: '更新', description: '版本检查与下载', icon: Download },
  { id: 'terminal', label: '终端', description: '右键复制与粘贴', icon: TerminalSquare },
  { id: 'data', label: '数据', description: '导入、导出与状态', icon: Database },
  { id: 'appearance', label: '外观', description: '主题与密度', icon: Palette },
  { id: 'advanced', label: '高级', description: '启动与调试', icon: Settings2 },
]

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
    () => settingsSections.find((section) => section.id === activeSection) || settingsSections[0],
    [activeSection],
  )

  return (
    <section className="settings-stage" aria-label="设置">
      <aside className="settings-nav-panel" aria-label="设置分类">
        <button type="button" className="settings-back-button" onClick={onBackToApp}>
          <ArrowLeft size={15} />
          返回应用
        </button>

        <div className="settings-nav-head">
          <span className="panel-kicker">偏好设置</span>
          <h1>设置</h1>
        </div>

        <div className="settings-nav-list">
          {settingsSections.map((section) => {
            const Icon = section.icon
            return (
              <button
                type="button"
                key={section.id}
                className={`settings-nav-item${activeSection === section.id ? ' active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <Icon size={16} />
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.description}</small>
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      <main className="settings-detail">
        <header className="settings-detail-head">
          <span className="panel-kicker">{activeMeta.description}</span>
          <h2>{activeMeta.label}</h2>
        </header>

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
      </main>
    </section>
  )
}
