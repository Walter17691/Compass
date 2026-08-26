import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    // Phase 6.5 hardening (structural remediation, Prompt 12 — Task/
    // Entity Identity invariant). Date.now() has millisecond resolution —
    // used to build an id, it silently collides the moment more than one
    // item is minted in the same synchronous pass (a batch-add loop,
    // seeding several items at once). Applies everywhere (client, api/,
    // tests) so the pattern can't creep back in via a new endpoint or a
    // copy-pasted test fixture either. Use newId() from src/lib/ids.js
    // (crypto.randomUUID()-based) instead. This only catches the literal
    // `id: ...Date.now()...` shape, not id values built through an
    // intermediate variable — a narrow, high-signal check rather than an
    // attempt at exhaustive static analysis.
    files: ['**/*.{js,jsx}'],
    ignores: ['dist/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Property[key.name='id'] > CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Do not build an id from Date.now() — it collides within the same millisecond. Use newId() from src/lib/ids.js instead.',
        },
      ],
    },
  },
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
    plugins: { react },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Deployment-pipeline fix (Prompt 13/14) — downgrading eslint
      // 10 -> 9 to resolve the eslint-plugin-jsx-a11y peer-dependency
      // conflict blocking every production install (see package.json's
      // own history) silently lost core no-unused-vars' ability to
      // recognise `<Btn/>` as a real use of an imported `Btn` — eslint
      // 10's own no-unused-vars evidently gained native JSX-usage
      // awareness that 9's doesn't have. Confirmed via a minimal probe
      // file and an untouched existing screen: every JSX-only-used
      // import in the whole client codebase was showing as "unused"
      // after the downgrade — a real, project-wide lint-signal
      // regression, not a security issue, but one that made lint
      // meaningless for exactly the files it matters most for. Just
      // this one rule from eslint-plugin-react restores the lost
      // capability without pulling in its full recommended ruleset
      // (which would surface a wave of new, untriaged findings).
      'react/jsx-uses-vars': 'error',
    },
  },
  {
    // api/, the Playwright test helpers, and the build configs are Node
    // code, not browser/React code — process, Buffer etc. are real
    // globals there, not undefined variables, and the React-hooks/
    // react-refresh rules don't apply to plain Node scripts.
    files: ['api/**/*.js', 'tests/e2e/**/*.js', 'vite.config.js', 'playwright.config.js', 'scripts/**/*.js'],
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
    plugins: { react },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'react/jsx-uses-vars': 'error',
    },
  },
])
