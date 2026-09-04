import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const fastRefreshSafeExports = [
  'createInitialHostForm',
  'createHostFormFromHost',
  'preloadSftpWorkspace',
  'useLanguage',
  'useAppearance',
  'useTerminalPreferences',
  'DEFAULT_TERMINAL_PREFERENCES',
  'useTheme',
]

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'src/wailsjs/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': ['warn', {
        allowConstantExport: true,
        allowExportNames: fastRefreshSafeExports,
      }],
    },
  },
  {
    files: ['src/**/*.test.tsx', 'src/test/**/*.ts', 'src/test/**/*.tsx'],
    rules: {
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
]
