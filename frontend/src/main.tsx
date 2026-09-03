import React from "react";
import ReactDOM from "react-dom/client";
import ThemeProvider from "./contexts/ThemeProvider";
import TerminalPreferencesProvider from "./contexts/TerminalPreferencesProvider";
import AppearanceProvider from "./contexts/AppearanceProvider";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("找不到应用挂载节点 #root。");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <TerminalPreferencesProvider>
        <AppearanceProvider>
          <App />
        </AppearanceProvider>
      </TerminalPreferencesProvider>
    </ThemeProvider>
  </React.StrictMode>
);
