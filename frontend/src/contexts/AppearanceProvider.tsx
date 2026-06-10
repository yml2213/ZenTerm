import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const ACCENT_HUE_KEY = "zenterm-accent-hue";
const ACCENT_SAT_KEY = "zenterm-accent-saturation";
const PANEL_OPACITY_KEY = "zenterm-panel-opacity";

const DEFAULT_HUE = 145;
const DEFAULT_SATURATION = 55;
const DEFAULT_OPACITY = 44;

interface AppearanceContextValue {
  accentHue: number;
  accentSaturation: number;
  panelOpacity: number;
  setAccentHue: (hue: number) => void;
  setAccentSaturation: (saturation: number) => void;
  setPanelOpacity: (opacity: number) => void;
  resetAppearance: () => void;
}

const AppearanceContext = createContext<AppearanceContextValue | undefined>(
  undefined
);

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used within an AppearanceProvider");
  }
  return context;
}

function loadNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const val = Number(raw);
  return Number.isFinite(val) ? val : fallback;
}

export default function AppearanceProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [accentHue, setAccentHueState] = useState(() =>
    loadNumber(ACCENT_HUE_KEY, DEFAULT_HUE)
  );
  const [accentSaturation, setAccentSaturationState] = useState(() =>
    loadNumber(ACCENT_SAT_KEY, DEFAULT_SATURATION)
  );
  const [panelOpacity, setPanelOpacityState] = useState(() =>
    loadNumber(PANEL_OPACITY_KEY, DEFAULT_OPACITY)
  );
  const [hasExplicitOpacity, setHasExplicitOpacity] = useState(
    () => localStorage.getItem(PANEL_OPACITY_KEY) !== null
  );

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--accent-hue", String(accentHue));
    root.setProperty("--accent-saturation", `${accentSaturation}%`);
    if (hasExplicitOpacity) {
      root.setProperty("--panel-opacity", `${panelOpacity}%`);
    }
  }, [accentHue, accentSaturation, panelOpacity, hasExplicitOpacity]);

  const setAccentHue = (hue: number) => {
    setAccentHueState(hue);
    localStorage.setItem(ACCENT_HUE_KEY, String(hue));
  };

  const setAccentSaturation = (saturation: number) => {
    setAccentSaturationState(saturation);
    localStorage.setItem(ACCENT_SAT_KEY, String(saturation));
  };

  const setPanelOpacity = (opacity: number) => {
    setPanelOpacityState(opacity);
    setHasExplicitOpacity(true);
    localStorage.setItem(PANEL_OPACITY_KEY, String(opacity));
  };

  const resetAppearance = () => {
    setAccentHue(DEFAULT_HUE);
    setAccentSaturation(DEFAULT_SATURATION);
    setPanelOpacityState(DEFAULT_OPACITY);
    setHasExplicitOpacity(false);
    localStorage.removeItem(PANEL_OPACITY_KEY);
  };

  return (
    <AppearanceContext.Provider
      value={{
        accentHue,
        accentSaturation,
        panelOpacity,
        setAccentHue,
        setAccentSaturation,
        setPanelOpacity,
        resetAppearance,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}
