import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    // Phase 6.5 hardening (accessibility pass) — jsx-a11y's recommended
    // rules only apply where JSX actually lives (this block); api/ and
    // the Node-only config/test-helper files below have none. Catches
    // the categories this phase audits by hand too (missing labels,
    // click-without-keyboard handlers, missing alt text, invalid ARIA)
    // as a standing lint check, not just a one-time sweep.
    files: ['**/*.{js,jsx}'],
    ignores: ['api/**/*.js', 'tests/e2e/**/*.js', 'vite.config.js', 'playwright.config.js', 'src/test/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
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
  {
    // src/test/** runs under vitest on Node with a jsdom environment
    // (vite.config.js), so both DOM globals (document, window — via
    // jsdom/testing-library) and real Node globals (process, Buffer) are
    // legitimate here, not undefined variables.
    files: ['src/test/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
