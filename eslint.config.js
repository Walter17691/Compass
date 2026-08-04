import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['api/**/*.js', 'tests/e2e/**/*.js', 'vite.config.js', 'playwright.config.js'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // api/, the Playwright test helpers, and the build configs are Node
    // code, not browser/React code — process, Buffer etc. are real
    // globals there, not undefined variables, and the React-hooks/
    // react-refresh rules don't apply to plain Node scripts.
    files: ['api/**/*.js', 'tests/e2e/**/*.js', 'vite.config.js', 'playwright.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])
