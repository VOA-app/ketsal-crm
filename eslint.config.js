import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'prototype', 'spikes', 'site', 'node_modules', 'test-results', 'playwright-report'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-refresh': reactRefresh },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // CLAUDE.md, правило 5: никаких console.log с данными
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // CLAUDE.md, правило 3: сеть — только в src/sync/*Adapter* и src/auth/
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Сеть — только в src/sync/*Adapter* и src/auth/' }],
      // CLAUDE.md, правило 2: Web Crypto — только в src/crypto/
      'no-restricted-properties': [
        'error',
        { object: 'crypto', property: 'subtle', message: 'Web Crypto — только в src/crypto/' },
      ],
    },
  },
  { files: ['src/sync/**/*Adapter*.ts', 'src/auth/**/*.ts'], rules: { 'no-restricted-globals': 'off' } },
  { files: ['src/crypto/**/*.ts'], rules: { 'no-restricted-properties': 'off' } },
  { files: ['*.config.ts', 'tests/**/*.ts'], languageOptions: { globals: globals.node } },
);
