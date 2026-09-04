import {
  Layers,
  Monitor,
  Moon,
  Palette,
  Pipette,
  RotateCcw,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'
import { useTheme } from '@/contexts/ThemeProvider'
import { useAppearance } from '@/contexts/AppearanceProvider'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSlider,
} from '../components/SettingsComponents'

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60
        break
      case g:
        h = ((b - r) / d + 2) * 60
        break
      case b:
        h = ((r - g) / d + 4) * 60
        break
    }
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

interface AccentPreset {
  label: string
  hue: number
  saturation: number
  colorHex: string
}

const ACCENT_PRESETS: AccentPreset[] = [
  { label: '翡翠绿', hue: 145, saturation: 55, colorHex: '#22c55e' },
  { label: '科技青', hue: 175, saturation: 60, colorHex: '#06b6d4' },
  { label: '深空蓝', hue: 215, saturation: 65, colorHex: '#3b82f6' },
  { label: '极光紫', hue: 270, saturation: 60, colorHex: '#a855f7' },
  { label: '落日粉', hue: 340, saturation: 65, colorHex: '#f43f5e' },
  { label: '暖阳橙', hue: 25, saturation: 75, colorHex: '#f97316' },
]

const THEME_OPTIONS: Array<{
  value: 'auto' | 'light' | 'dark'
  label: string
  desc: string
  icon: LucideIcon
}> = [
  { value: 'auto', label: '跟随系统', desc: '根据 macOS 外观自动切换', icon: Monitor },
  { value: 'light', label: '浅色明亮', desc: '清爽通透的高对比灰白', icon: Sun },
  { value: 'dark', label: '暗黑极客', desc: '深邃沉浸的暗色背景', icon: Moon },
]

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const {
    accentHue,
    accentSaturation,
    panelOpacity,
    sidebarOpacity,
    setAccentHue,
    setAccentSaturation,
    setPanelOpacity,
    setSidebarOpacity,
    resetAppearance,
  } = useAppearance()

  const colorInputRef = useRef<HTMLInputElement>(null)
  const activePreset = ACCENT_PRESETS.find(
    (preset) => preset.hue === accentHue && Math.abs(preset.saturation - accentSaturation) <= 5,
  )
  const isCustom = !activePreset

  function handleCustomColorChange(e: ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value
    const { h, s } = hexToHsl(hex)
    setAccentHue(h)
    setAccentSaturation(Math.max(20, Math.min(80, s)))
  }

  function openCustomPicker() {
    colorInputRef.current?.click()
  }

  const currentAccentColor = `hsl(${accentHue} ${accentSaturation}% 50%)`

  return (
    <div className="settings-section-stack">
      {/* 实时主题缩略预览 */}
      <div className="settings-preview-banner">
        <div className="settings-preview-banner-head">
          <Sparkles size={16} />
          <span>外观实时预览 (Live Theme Preview)</span>
        </div>
        <div className={`settings-mini-window theme-${theme}`}>
          <div className="mini-window-titlebar">
            <div className="mini-traffic-lights">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
            </div>
            <div className="mini-tab-strip">
              <div
                className="mini-tab active"
                style={{ borderBottomColor: currentAccentColor }}
              >
                <span className="mini-tab-dot" style={{ backgroundColor: currentAccentColor }} />
                <span>prod-server</span>
              </div>
              <div className="mini-tab">
                <span>dev-bastion</span>
              </div>
            </div>
          </div>
          <div className="mini-window-body">
            <div
              className="mini-sidebar"
              style={{ opacity: sidebarOpacity / 100 }}
            >
              <div className="mini-nav-item active" style={{ color: currentAccentColor }}>
                <div className="mini-nav-dot" style={{ backgroundColor: currentAccentColor }} />
                <span>主机</span>
              </div>
              <div className="mini-nav-item"><span>钥匙串</span></div>
              <div className="mini-nav-item"><span>设置</span></div>
            </div>
            <div
              className="mini-content"
              style={{ opacity: panelOpacity / 100 }}
            >
              <div className="mini-card">
                <div className="mini-card-head">
                  <span className="mini-host-badge" style={{ backgroundColor: currentAccentColor }} />
                  <span className="mini-host-title">Ubuntu 22.04 LTS</span>
                </div>
                <div className="mini-card-btn" style={{ backgroundColor: currentAccentColor }}>
                  SSH 连接
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 主题选择卡片 */}
      <SettingsGroup
        title="色彩外观模式"
        description="选择适合您当前环境与偏好的明暗风格模式。"
      >
        <div className="appearance-theme-cards">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon
            const active = theme === option.value
            return (
              <button
                key={option.value}
                type="button"
                className={`appearance-theme-card${active ? ' is-active' : ''}`}
                onClick={() => setTheme(option.value)}
              >
                <div className={`theme-card-illustration theme-illus-${option.value}`}>
                  <div className="illus-header">
                    <span className="illus-dot" />
                    <span className="illus-dot" />
                    <span className="illus-dot" />
                  </div>
                  <div className="illus-body">
                    <div className="illus-side" />
                    <div className="illus-main">
                      <div className="illus-line" />
                      <div className="illus-badge" />
                    </div>
                  </div>
                </div>
                <div className="theme-card-info">
                  <div className="theme-card-title">
                    <Icon size={15} />
                    <strong>{option.label}</strong>
                  </div>
                  <small>{option.desc}</small>
                </div>
              </button>
            )
          })}
        </div>
      </SettingsGroup>

      {/* 强调色 */}
      <SettingsGroup
        title="界面强调色"
        description="自定义按钮、高亮选中态、指示灯和标签徽标的品牌主色调。"
      >
        <div className="appearance-accent-section">
          <div className="appearance-accent-palette">
            {ACCENT_PRESETS.map((preset) => {
              const active = activePreset?.hue === preset.hue
              return (
                <button
                  key={preset.hue}
                  type="button"
                  className={`accent-palette-chip${active ? ' is-active' : ''}`}
                  onClick={() => {
                    setAccentHue(preset.hue)
                    setAccentSaturation(preset.saturation)
                  }}
                  title={preset.label}
                  aria-label={preset.label}
                >
                  <span
                    className="accent-palette-swatch"
                    style={{ backgroundColor: preset.colorHex }}
                  />
                  <span className="accent-palette-name">{preset.label}</span>
                </button>
              )
            })}
            <button
              type="button"
              className={`accent-palette-chip custom-chip${isCustom ? ' is-active' : ''}`}
              onClick={openCustomPicker}
              title="自定义色盘取色"
              aria-label="自定义颜色"
            >
              <span
                className="accent-palette-swatch custom-swatch"
                style={{ backgroundColor: currentAccentColor }}
              >
                <Pipette size={12} />
              </span>
              <span className="accent-palette-name">自定义</span>
            </button>
            <input
              ref={colorInputRef}
              type="color"
              className="appearance-color-input-hidden"
              value={hslToHex(accentHue, accentSaturation, 50)}
              onChange={handleCustomColorChange}
            />
          </div>

          <div className="appearance-sliders-box">
            <SettingsRow
              title="色相微调 (Hue)"
              description="顺时针在 360° 色轮上选取您偏好的主色系。"
            >
              <SettingsSlider
                min={0}
                max={360}
                value={accentHue}
                unit="°"
                onChange={setAccentHue}
                ariaLabel="色相"
              />
            </SettingsRow>

            <SettingsRow
              title="饱和度微调 (Saturation)"
              description="控制色彩的鲜艳与纯度程度（建议 40% ~ 70% 保持舒适感）。"
            >
              <SettingsSlider
                min={20}
                max={85}
                value={accentSaturation}
                unit="%"
                onChange={setAccentSaturation}
                ariaLabel="饱和度"
              />
            </SettingsRow>
          </div>
        </div>
      </SettingsGroup>

      {/* 毛玻璃与不透明度 */}
      <SettingsGroup
        title="背景与毛玻璃质感"
        description="调节 macOS 原生半透明背景与高斯模糊（Vibrancy）的穿透程度。"
      >
        <SettingsRow
          icon={Layers}
          title="侧边栏不透明度"
          description="调节左侧导航区域的背景浓度，低透明度能带来更通透的毛玻璃效果。"
        >
          <SettingsSlider
            min={20}
            max={100}
            value={sidebarOpacity}
            unit="%"
            onChange={setSidebarOpacity}
            ariaLabel="侧边栏不透明度"
          />
        </SettingsRow>

        <SettingsRow
          icon={Palette}
          title="主工作区不透明度"
          description="调节主机列表与设置卡片内容区的半透明浓度。"
        >
          <SettingsSlider
            min={20}
            max={100}
            value={panelOpacity}
            unit="%"
            onChange={setPanelOpacity}
            ariaLabel="内容区不透明度"
          />
        </SettingsRow>
      </SettingsGroup>

      {/* 恢复默认 */}
      <div className="settings-footer-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={resetAppearance}
        >
          <RotateCcw size={14} />
          <span>恢复外观默认设置</span>
        </button>
      </div>
    </div>
  )
}
