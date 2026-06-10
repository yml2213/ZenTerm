import {
  Monitor,
  Moon,
  Palette,
  Pipette,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { useTheme } from "../contexts/ThemeProvider";
import { useAppearance } from "../contexts/AppearanceProvider";

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      case b:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

interface AccentPreset {
  label: string;
  hue: number;
  saturation: number;
}

const ACCENT_PRESETS: AccentPreset[] = [
  { label: "绿", hue: 145, saturation: 55 },
  { label: "青", hue: 175, saturation: 55 },
  { label: "蓝", hue: 215, saturation: 60 },
  { label: "紫", hue: 270, saturation: 55 },
  { label: "粉", hue: 340, saturation: 60 },
  { label: "橙", hue: 25, saturation: 70 },
];

const THEME_OPTIONS: Array<{
  value: "auto" | "light" | "dark";
  label: string;
  icon: LucideIcon;
}> = [
  { value: "auto", label: "跟随系统", icon: Monitor },
  { value: "light", label: "亮色", icon: Sun },
  { value: "dark", label: "暗色", icon: Moon },
];

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const {
    accentHue,
    accentSaturation,
    panelOpacity,
    setAccentHue,
    setAccentSaturation,
    setPanelOpacity,
    resetAppearance,
  } = useAppearance();

  const colorInputRef = useRef<HTMLInputElement>(null);
  const activePreset = ACCENT_PRESETS.find(
    (preset) =>
      preset.hue === accentHue && preset.saturation === accentSaturation
  );
  const isCustom = !activePreset;

  function handleCustomColorChange(e: ChangeEvent<HTMLInputElement>) {
    const hex = e.target.value;
    const { h, s } = hexToHsl(hex);
    setAccentHue(h);
    setAccentSaturation(Math.max(20, Math.min(80, s)));
  }

  function openCustomPicker() {
    colorInputRef.current?.click();
  }

  return (
    <div className="settings-section-stack">
      {/* 主题 */}
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Monitor size={18} />
          <div>
            <h3>主题</h3>
            <p>选择应用的明暗风格。</p>
          </div>
        </div>

        <div className="appearance-theme-grid">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                className={`appearance-theme-option${
                  theme === option.value ? " active" : ""
                }`}
                onClick={() => setTheme(option.value)}
              >
                <Icon size={16} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 强调色 */}
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Palette size={18} />
          <div>
            <h3>强调色</h3>
            <p>自定义界面高亮、按钮和选中状态的主色调。</p>
          </div>
        </div>

        <div className="appearance-accent-presets">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.hue}
              type="button"
              className={`appearance-accent-swatch${
                activePreset === preset ? " active" : ""
              }`}
              onClick={() => {
                setAccentHue(preset.hue);
                setAccentSaturation(preset.saturation);
              }}
              aria-label={preset.label}
              title={preset.label}
            >
              <span
                className="appearance-accent-dot"
                style={{
                  background: `hsl(${preset.hue} ${preset.saturation}% 48%)`,
                }}
              />
              <small>{preset.label}</small>
            </button>
          ))}
          <button
            type="button"
            className={`appearance-accent-swatch${isCustom ? " active" : ""}`}
            onClick={openCustomPicker}
            aria-label="自定义颜色"
            title="自定义颜色"
          >
            <span
              className="appearance-accent-dot appearance-accent-dot-custom"
              style={{
                background: `hsl(${accentHue} ${accentSaturation}% 48%)`,
              }}
            >
              <Pipette size={12} />
            </span>
            <small>自定义</small>
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="appearance-color-input-hidden"
            value={hslToHex(accentHue, accentSaturation, 48)}
            onChange={handleCustomColorChange}
          />
        </div>

        <label className="appearance-slider-row">
          <span>色相</span>
          <input
            type="range"
            min={0}
            max={360}
            value={accentHue}
            onChange={(e) => setAccentHue(Number(e.target.value))}
          />
          <output>{accentHue}°</output>
        </label>

        <label className="appearance-slider-row">
          <span>饱和度</span>
          <input
            type="range"
            min={20}
            max={80}
            value={accentSaturation}
            onChange={(e) => setAccentSaturation(Number(e.target.value))}
          />
          <output>{accentSaturation}%</output>
        </label>
      </section>

      {/* 透明度 */}
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Palette size={18} />
          <div>
            <h3>面板透明度</h3>
            <p>控制侧边栏和内容区域的背景透明程度。</p>
          </div>
        </div>

        <label className="appearance-slider-row">
          <span>透明度</span>
          <input
            type="range"
            min={20}
            max={100}
            value={panelOpacity}
            onChange={(e) => setPanelOpacity(Number(e.target.value))}
          />
          <output>{panelOpacity}%</output>
        </label>
      </section>

      {/* 重置 */}
      <div className="settings-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={resetAppearance}
        >
          恢复默认
        </button>
      </div>
    </div>
  );
}
