import { FileEdit, History, Info, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getAppPreferences,
  getAppVersion,
  saveAppPreferences,
  browserOpenURL,
  type AppPreferences,
} from "@/lib/backend";

const GITHUB_URL = "https://github.com/user/ZenTerm";

export default function AdvancedSettings() {
  const [prefs, setPrefs] = useState<AppPreferences>({});
  const [appVersion, setAppVersion] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [prefsData, version] = await Promise.all([
        getAppPreferences(),
        getAppVersion(),
      ]);
      setPrefs(prefsData);
      setAppVersion(version);
    } catch (e) {
      console.error("Failed to load data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggle = async (
    key:
      | "open_inspector_on_startup"
      | "record_session_transcripts"
      | "disable_editor_backup",
    value: boolean
  ) => {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    try {
      await saveAppPreferences(newPrefs);
    } catch (e) {
      console.error("Failed to save preferences:", e);
      setPrefs(prefs);
    }
  };

  const handleRetentionLimitChange = async (value: number) => {
    const nextValue = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
    const newPrefs = { ...prefs, session_log_retention_limit: nextValue };
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
      <section className="settings-section-panel">
        <div className="settings-section-title">
          <FileEdit size={18} />
          <div>
            <h3>文件编辑</h3>
            <p>SFTP 文件编辑器的保存行为。</p>
          </div>
        </div>

        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={!(prefs.disable_editor_backup || false)}
            onChange={(e) =>
              handleToggle("disable_editor_backup", !e.target.checked)
            }
          />
          <span>
            <strong>保存前自动备份原文件</strong>
            <small>
              编辑保存前在同目录生成「文件名.bak」，改错了可手动改回；每次保存会覆盖旧备份。备份失败时中止保存。
            </small>
          </span>
        </label>
      </section>

      <section className="settings-section-panel">
        <div className="settings-section-title">
          <History size={18} />
          <div>
            <h3>连接日志</h3>
            <p>控制终端输出录制与历史记录留存。</p>
          </div>
        </div>

        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={prefs.record_session_transcripts || false}
            onChange={(e) =>
              handleToggle("record_session_transcripts", e.target.checked)
            }
          />
          <span>
            <strong>记录终端输出</strong>
            <small>关闭时只保存连接元数据，不保存可见终端内容。</small>
          </span>
        </label>

        <label>
          <span>最多保留连接日志</span>
          <input
            type="number"
            min={0}
            step={1}
            value={prefs.session_log_retention_limit ?? 200}
            onChange={(e) =>
              handleRetentionLimitChange(Number(e.target.value))
            }
          />
          <small>默认 200 条；填 0 时不自动清理历史。</small>
        </label>
      </section>

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
              <div className="about-version">
                版本 {appVersion || "加载中..."}
              </div>
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
