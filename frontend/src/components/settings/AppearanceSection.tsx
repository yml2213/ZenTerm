import { Settings2 } from 'lucide-react'

export default function AppearanceSection() {
  return (
    <section className="settings-section-panel settings-empty-section">
      <Settings2 size={18} />
      <div>
        <h3>外观</h3>
        <p>主题、强调色和界面密度会在这里统一管理。</p>
      </div>
      <span className="pill subtle">稍后开放</span>
    </section>
  )
}
