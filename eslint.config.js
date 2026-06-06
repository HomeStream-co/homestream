import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  {
    ignores: ['dist', 'node_modules', '.next', '.vite'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        // All browser globals (window, document, setTimeout, fetch, etc.)
        ...globals.browser,
        // All Node.js globals (process, Buffer, __dirname, etc.)
        ...globals.node,
        // Service worker globals
        ...globals.serviceworker,
        // Vitest/testing globals
        ...globals.jest,
        // Additional globals not in the standard sets
        React: 'readonly',
        JSX: 'readonly',
        NodeJS: 'readonly',
        __APP_VERSION__: 'readonly',
        // DOM types not yet in standard browser globals
        MessageEventSource: 'readonly',
        EventListener: 'readonly',
        EventListenerOrEventListenerObject: 'readonly',
        ChildNode: 'readonly',
        HeadersInit: 'readonly',
        RequestInit: 'readonly',
        ResponseInit: 'readonly',
        BodyInit: 'readonly',
        // Speech Recognition API (not in standard browser globals yet)
        SpeechRecognition: 'readonly',
        SpeechRecognitionResultList: 'readonly',
        SpeechRecognitionResult: 'readonly',
        SpeechRecognitionAlternative: 'readonly',
        webkitSpeechRecognition: 'readonly',
        // Testing library globals
        fireEvent: 'readonly',
        waitFor: 'readonly',
        act: 'readonly',
        // Electron globals
        electronAPI: 'readonly',
      },
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Downgrade unused-vars to warn and allow common patterns
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '.*',
        destructuredArrayIgnorePattern: '^_',
      }],
      // Downgrade explicit-any to warn (already was warn, keep it)
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      // Disable no-var-requires (rule not available in this version)
      '@typescript-eslint/no-var-requires': 'off',
      // Downgrade expression/unreachable issues to warn
      'no-unused-expressions': 'warn',
      'no-unreachable': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  // Test file overrides
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      // expect().toHaveBeenCalled() etc. are valid expressions in tests
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-unused-expressions': 'off',
    },
  },
];
