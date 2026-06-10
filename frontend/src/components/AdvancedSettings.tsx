import { Settings2, Info } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getAppPreferences,
  saveAppPreferences,
  browserOpenURL,
  type AppPreferences,
} from "../lib/backend";

const GITHUB_URL = "https://github.com/user/ZenTerm";
const APP_VERSION = "0.1.2";

export default function AdvancedSettings() {
  const [prefs, setPrefs] = useState<AppPreferences>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = async () => {
    try {
      const data = await getAppPreferences();
      setPrefs(data);
    } catch (e) {
      console.error("Failed to load app preferences:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (key: keyof AppPreferences, value: boolean) => {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    try {
      await saveAppPreferences(newPrefs);
    } catch (e) {
      console.error("Failed to save preferences:", e);
      setPrefs(prefs);
    }
  };

  if (loading) {
    return <div className="settings-loading">加载中...</div>;
  }

  return (
    <div className="settings-section-stack">
      {/* 开发者工具 */}
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Settings2 size={18} />
          <div>
            <h3>开发者工具</h3>
            <p>启用开发者工具用于调试和检查。</p>
          </div>
        </div>

        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={prefs.open_inspector_on_startup || false}
            onChange={(e) =>
              handleToggle("open_inspector_on_startup", e.target.checked)
            }
          />
          <span>
            <strong>启动时打开 Inspector</strong>
            <small>应用启动时自动打开开发者检查器。</small>
          </span>
        </label>
      </section>

      {/* 关于 */}
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <Info size={18} />
          <div>
            <h3>关于 ZenTerm</h3>
            <p>应用信息与相关链接。</p>
          </div>
        </div>

        <div className="about-app">
          <div className="about-logo">
            <div className="about-logo-icon">⚡</div>
            <div>
              <div className="about-name">ZenTerm</div>
              <div className="about-version">版本 {APP_VERSION}</div>
            </div>
          </div>
          <div className="about-links">
            <button
              className="settings-btn-flat"
              onClick={() => browserOpenURL(GITHUB_URL)}
            >
              GitHub 仓库
            </button>
          </div>
          <div className="about-footer">
            <p>© {new Date().getFullYear()} ZenTerm. 保留所有权利。</p>
            <p className="about-license">基于 MIT 许可证发布。</p>
          </div>
        </div>
      </section>
    </div>
  );
}
