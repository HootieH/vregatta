import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        chrome: 'readonly',
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        self: 'readonly',
        indexedDB: 'readonly',
        IDBKeyRange: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        HTMLElement: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        localStorage: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
      },
    },
  },
  {
    ignores: ['dist/', 'node_modules/'],
  },
];
