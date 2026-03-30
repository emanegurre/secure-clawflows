const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

const nodeGlobals = {
  Buffer: 'readonly',
  __dirname: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setTimeout: 'readonly',
};

module.exports = [
  {
    ignores: ['**/dist/**', 'coverage/**', '.secure-clawflows/**', 'node_modules/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: nodeGlobals,
      sourceType: 'commonjs',
    },
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: nodeGlobals,
      parser: tsParser,
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-console': [
        'error',
        {
          allow: ['error', 'info', 'warn'],
        },
      ],
    },
  },
];
