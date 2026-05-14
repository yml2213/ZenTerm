import { createContext, useContext, useState, type ReactNode } from 'react'

type Language = 'zh' | 'en'
type TranslationKey = keyof typeof translations.zh

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey) => string
}

const LANGUAGE_KEY = 'zenterm-language'

const translations = {
  zh: {
    // Toolbar
    hosts: '主机',
    vaults: '保险箱',
    sftp: 'SFTP',
    searchPlaceholder: '搜索主机...',
    newHost: '新建主机',

    // Sidebar
    databases: '数据库',
    snippets: '代码片段',
    portForwarding: '端口转发',
    amazonVaults: 'Amazon 保险箱',
    tags: '标签',
    settings: '设置',

    // Host list
    unlockVault: '首次使用需要设置主密码来保护本地加密存储',
    unlockButton: '输入主密码继续',

    // Errors
    errorTitle: '发生错误',
    confirm: '确定',
  },
  en: {
    // Toolbar
    hosts: 'Hosts',
    vaults: 'Vaults',
    sftp: 'SFTP',
    searchPlaceholder: 'Search hosts...',
    newHost: 'New Host',

    // Sidebar
    databases: 'Databases',
    snippets: 'Snippets',
    portForwarding: 'Port Forwarding',
    amazonVaults: 'Amazon Vaults',
    tags: 'Tags',
    settings: 'Settings',

    // Host list
    unlockVault: 'Set a master password to protect local encrypted storage',
    unlockButton: 'Continue with Master Password',

    // Errors
    errorTitle: 'Error',
    confirm: 'OK',
  },
} as const

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}

export default function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LANGUAGE_KEY)
      if (saved === 'zh' || saved === 'en') return saved
      // Auto-detect from browser
      const browserLang = navigator.language.toLowerCase()
      return browserLang.startsWith('zh') ? 'zh' : 'en'
    }
    return 'zh'
  })

  const setLanguage = (newLanguage: Language) => {
    setLanguageState(newLanguage)
    localStorage.setItem(LANGUAGE_KEY, newLanguage)
  }

  const t = (key: TranslationKey) => {
    return translations[language][key] || key
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}
