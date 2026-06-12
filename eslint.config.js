import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/**
 * ESLint (flat config) para Hito — React 19 + TypeScript + Vite.
 * Revisa errores reales y malas prácticas: reglas de Hooks, variables sin usar,
 * `any` y demás. No formatea (eso queda para Prettier si se suma después).
 */
export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Módulos de contexto (Provider + su hook + constantes co-localizados a
    // propósito): fast-refresh funciona igual en la práctica, así que apagamos
    // este warning de DX en vez de partir el archivo y reescribir imports.
    files: ['src/app/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Service workers (public/): corren en otro contexto global que el browser.
    files: ['public/**/*.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
)
