import {
  AlignLeft,
  AppWindow,
  MousePointer,
  RotateCcw,
  Sparkles,
  Terminal,
  Type,
} from 'lucide-react'
import { useState } from 'react'
import {
  useTerminalPreferences,
  type CursorStyle,
} from '@/contexts/TerminalPreferencesProvider'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSegmented,
  SettingsSlider,
  SettingsSwitch,
} from '../components/SettingsComponents'

const FONT_PRESETS = [
  { label: 'JetBrains Mono', value: 'JetBrains Mono, Menlo, monospace' },
  { label: 'Fira Code', value: '"Fira Code", Menlo, monospace' },
  { label: 'SF Mono', value: '"SF Mono", Menlo, monospace' },
  { label: 'Menlo', value: 'Menlo, Monaco, monospace' },
  { label: 'Cascadia Code', value: '"Cascadia Code", Consolas, monospace' },
  { label: 'Consolas', value: 'Consolas, monospace' },
  { label: '自定义 (Custom)', value: 'custom' },
]

const CURSOR_OPTIONS: Array<{
  value: CursorStyle
  label: string
}> = [
  { value: 'bar', label: '竖线 Bar' },
  { value: 'block', label: '方块 Block' },
  { value: 'underline', label: '下划线 Underline' },
]

export default function TerminalSection() {
  const {
    quickEditEnabled,
    webLinksEnabled,
    fontFamily,
    fontSize,
    lineHeight,
    cursorStyle,
    cursorBlink,
    scrollback,
    setQuickEditEnabled,
    setWebLinksEnabled,
    setFontFamily,
    setFontSize,
    setLineHeight,
    setCursorStyle,
    setCursorBlink,
    setScrollback,
    resetTerminalPreferences,
  } = useTerminalPreferences()

  const currentPreset = FONT_PRESETS.find((p) => p.value === fontFamily)
  const isCustomFont = !currentPreset || currentPreset.value === 'custom'
  const [customFontInput, setCustomFontInput] = useState(fontFamily)

  function handleFontSelect(value: string) {
    if (value === 'custom') {
      setFontFamily(customFontInput || 'monospace')
    } else {
      setFontFamily(value)
    }
  }

  function handleCustomFontBlur() {
    if (customFontInput.trim()) {
      setFontFamily(customFontInput.trim())
    }
  }

  return (
    <div className="settings-section-stack">
      {/* 实时终端预览 */}
      <div className="settings-preview-banner">
        <div className="settings-preview-banner-head">
          <Sparkles size={16} />
          <span>终端效果实时预览 (Live Terminal Preview)</span>
        </div>
        <div className="terminal-preview-terminal-box">
          <div className="terminal-preview-bar">
            <div className="mini-traffic-lights">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
            </div>
            <span className="terminal-preview-title">ssh admin@zen-host-01 (xterm.js)</span>
          </div>
          <div
            className="terminal-preview-screen"
            style={{
              fontFamily: fontFamily,
              fontSize: `${fontSize}px`,
              lineHeight: lineHeight,
            }}
          >
            <div className="term-line">
              <span className="term-cyan">ZenTerm SSH Workbench</span> v0.1.8 (x86_64-apple-darwin)
            </div>
            <div className="term-line">
              <span className="term-dim">Last login: Thu Sep 3 23:14:02 2026 from 192.168.1.100</span>
            </div>
            <div className="term-line term-prompt-line">
              <span className="term-green">deploy@prod-bastion</span>
              <span className="term-dim">:</span>
              <span className="term-blue">~/app</span>
              <span className="term-dim">$</span> docker compose ps
            </div>
            <div className="term-line term-table-line">
              <span className="term-dim">NAME               STATUS    PORTS</span>
            </div>
            <div className="term-line term-table-line">
              <span className="term-white">zenterm-web-1</span>      <span className="term-green">Up 4h</span>     0.0.0.0:8080-&gt;80/tcp
            </div>
            <div className="term-line term-prompt-line">
              <span className="term-green">deploy@prod-bastion</span>
              <span className="term-dim">:</span>
              <span className="term-blue">~/app</span>
              <span className="term-dim">$</span>{' '}
              <span className="term-cmd-sample">curl -I https://api.zenterm.dev</span>
              <span
                className={`term-cursor cursor-${cursorStyle}${cursorBlink ? ' cursor-blink' : ''}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 字体与字号 */}
      <SettingsGroup
        title="排版与字体"
        description="选择等宽字体、大小与行高，带来最清晰的终端阅读体验。"
      >
        <SettingsRow
          icon={Type}
          title="终端字体系列 (Font Family)"
          description="选择内置经典编程等宽字体或输入自定义字体名称。"
        >
          <div className="terminal-font-selector">
            <select
              value={isCustomFont ? 'custom' : fontFamily}
              onChange={(e) => handleFontSelect(e.target.value)}
              className="settings-select"
            >
              {FONT_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {isCustomFont && (
              <input
                type="text"
                placeholder="输入自定义字体名称，如 Hack, Monaco"
                value={customFontInput}
                onChange={(e) => setCustomFontInput(e.target.value)}
                onBlur={handleCustomFontBlur}
                className="settings-input custom-font-input"
              />
            )}
          </div>
        </SettingsRow>

        <SettingsRow
          icon={AlignLeft}
          title="字体大小 (Font Size)"
          description="调整字符物理显示像素大小（推荐 13px ~ 16px）。"
        >
          <SettingsSlider
            min={11}
            max={22}
            step={1}
            value={fontSize}
            unit="px"
            onChange={setFontSize}
            ariaLabel="字体大小"
          />
        </SettingsRow>

        <SettingsRow
          icon={AlignLeft}
          title="行间距倍数 (Line Height)"
          description="控制终端文本上下行之间的留白舒适度。"
        >
          <SettingsSlider
            min={1.0}
            max={1.8}
            step={0.05}
            value={lineHeight}
            formatValue={(v) => v.toFixed(2)}
            onChange={setLineHeight}
            ariaLabel="行高"
          />
        </SettingsRow>
      </SettingsGroup>

      {/* 光标行为 */}
      <SettingsGroup
        title="光标形态与动画"
        description="定制终端光标的外观样式与闪烁节奏。"
      >
        <SettingsRow
          icon={Terminal}
          title="光标形态 (Cursor Style)"
          description="支持竖线、实心方块以及下划线三种形态。"
        >
          <SettingsSegmented
            options={CURSOR_OPTIONS}
            value={cursorStyle}
            onChange={setCursorStyle}
            size="sm"
          />
        </SettingsRow>

        <SettingsRow
          title="光标呼吸闪烁"
          description="光标在闲置或等待输入时周期性闪烁提醒。"
        >
          <SettingsSwitch
            checked={cursorBlink}
            onChange={setCursorBlink}
            label="光标呼吸闪烁"
          />
        </SettingsRow>
      </SettingsGroup>

      {/* 鼠标与剪贴板交互 */}
      <SettingsGroup
        title="鼠标与剪贴板交互"
        description="提升 SSH 会话中的操作效率，兼容常见终端交互习惯。"
      >
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={quickEditEnabled}
            onChange={(event) => setQuickEditEnabled(event.target.checked)}
            className="settings-switch-native"
          />
          <div className="settings-toggle-copy">
            <strong>快速编辑模式</strong>
            <small>选中文本时右键复制，没有选区时右键粘贴。</small>
          </div>
          <span className={`settings-switch-track${quickEditEnabled ? ' is-checked' : ''}`} aria-hidden="true">
            <span className="settings-switch-thumb" />
          </span>
        </label>

        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={webLinksEnabled}
            onChange={(event) => setWebLinksEnabled(event.target.checked)}
            className="settings-switch-native"
          />
          <div className="settings-toggle-copy">
            <strong>URL 点击打开</strong>
            <small>识别终端输出中的 http 和 https 链接，点击后用系统浏览器打开。</small>
          </div>
          <span className={`settings-switch-track${webLinksEnabled ? ' is-checked' : ''}`} aria-hidden="true">
            <span className="settings-switch-thumb" />
          </span>
        </label>
      </SettingsGroup>

      {/* 滚动缓冲区 */}
      <SettingsGroup
        title="性能与历史回溯"
        description="设置每个 SSH 会话在前端保留的最大滚动缓冲行数。"
      >
        <SettingsRow
          icon={AppWindow}
          title="滚动缓冲行数 (Scrollback)"
          description="超出行数后最前面的历史输出会被自动丢弃，较大数值会占用略多内存。"
        >
          <SettingsSlider
            min={1000}
            max={50000}
            step={1000}
            value={scrollback}
            formatValue={(v) => `${(v / 1000).toFixed(0)}k 行`}
            onChange={setScrollback}
            ariaLabel="滚动缓冲行数"
          />
        </SettingsRow>
      </SettingsGroup>

      {/* 恢复默认 */}
      <div className="settings-footer-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={resetTerminalPreferences}
        >
          <RotateCcw size={14} />
          <span>恢复终端默认偏好</span>
        </button>
      </div>
    </div>
  )
}
