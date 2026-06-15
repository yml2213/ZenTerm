import { TerminalSquare } from 'lucide-react'
import { useTerminalPreferences } from '../../contexts/TerminalPreferencesProvider'

export default function TerminalSection() {
  const {
    quickEditEnabled,
    webLinksEnabled,
    setQuickEditEnabled,
    setWebLinksEnabled,
  } = useTerminalPreferences()

  return (
    <div className="settings-section-stack">
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <TerminalSquare size={18} />
          <div>
            <h3>终端交互</h3>
            <p>调整 SSH 终端里的鼠标与剪贴板行为。</p>
          </div>
        </div>

        <div className="settings-toggle-list">
          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={quickEditEnabled}
              onChange={(event) => setQuickEditEnabled(event.target.checked)}
            />
            <span>
              <strong>快速编辑模式</strong>
              <small>选中文本时右键复制，没有选区时右键粘贴。</small>
            </span>
          </label>

          <label className="settings-toggle-row">
            <input
              type="checkbox"
              checked={webLinksEnabled}
              onChange={(event) => setWebLinksEnabled(event.target.checked)}
            />
            <span>
              <strong>URL 点击打开</strong>
              <small>识别终端输出中的 http 和 https 链接，点击后用系统浏览器打开。</small>
            </span>
          </label>
        </div>
      </section>
    </div>
  )
}
