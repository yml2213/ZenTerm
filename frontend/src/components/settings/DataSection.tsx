import { Settings2 } from 'lucide-react'

export default function DataSection() {
  return (
    <section className="settings-section-panel settings-empty-section">
      <Settings2 size={18} />
      <div>
        <h3>数据</h3>
        <p>导入、导出、备份恢复和诊断入口会集中在这里。</p>
      </div>
      <span className="pill subtle">稍后开放</span>
    </section>
  )
}
