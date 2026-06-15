import { Settings2 } from 'lucide-react'

export default function AdvancedSection() {
  return (
    <section className="settings-section-panel settings-empty-section">
      <Settings2 size={18} />
      <div>
        <h3>高级</h3>
        <p>启动行为、调试和实验选项会收进这里。</p>
      </div>
      <span className="pill subtle">稍后开放</span>
    </section>
  )
}
