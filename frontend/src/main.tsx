import React from 'react'
import ReactDOM from 'react-dom/client'
import ThemeProvider from './contexts/ThemeProvider.jsx'
import LanguageProvider from './contexts/LanguageProvider.jsx'
import App from './App.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
