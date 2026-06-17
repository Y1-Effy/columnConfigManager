import pluginImport from 'eslint-plugin-import';
import pluginN from 'eslint-plugin-n';
import pluginPromise from 'eslint-plugin-promise';

export default [
  {
    ignores: [
      'node_modules/**',
      '.cursor/**',
      '.vscode/**',
    ],
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // ブラウザ環境（フロントエンドJS用）
        window: true,
        document: true,
        fetch: true,
        // Node.js環境（バックエンドJS用）
        process: true,
      },
    },
    plugins: {
      import: pluginImport,
      promise: pluginPromise,
      n: pluginN,
    },
    rules: {
      'linebreak-style': ['error', 'unix'],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'no-console': 'off',
      'no-var': 'error',
      'curly': ['error', 'all'],
      'no-debugger': 'error',
      'no-fallthrough': 'error',
      'comma-dangle': ['error', 'always-multiline'],
      'spaced-comment': ['warn', 'always', {
        block: { balanced: true, exceptions: ['*'] },
      }],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never'],
      'no-duplicate-imports': 'error',
      'no-useless-catch': 'warn',
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'no-trailing-spaces': 'error',
      'space-infix-ops': ['error'],
      'func-call-spacing': ['error', 'never'],
      'space-before-function-paren': ['error', 'never'],
      'require-await': 'warn',
      'key-spacing': ['error', { beforeColon: false, afterColon: true }],
      'indent': ['error', 2, {
        SwitchCase: 1,
        MemberExpression: 1,
        ignoreComments: false,
      }],
      'keyword-spacing': ['error', { before: true, after: true }],
      'space-before-blocks': ['error', 'always'],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'block-spacing': ['error', 'always'],
      'prefer-const': 'error',
      'no-multi-spaces': ['warn'],
      'arrow-spacing': ['error', { before: true, after: true }],
      'comma-spacing': ['error', { before: false, after: true }],
      'no-whitespace-before-property': 'error',
      'space-in-parens': ['error', 'never'],
      'no-case-declarations': 'error',
      'no-constant-condition': ['warn', { checkLoops: false }],
      'no-unsafe-optional-chaining': 'error',
      'template-curly-spacing': ['error', 'never'],
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-useless-concat': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-shadow': 'error',
      'consistent-return': 'error',
      'import/no-unresolved': 'error',
      'import/no-duplicates': 'error',
      'import/order': ['warn', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        alphabetize: { order: 'asc', caseInsensitive: true },
        'newlines-between': 'always',
      }],
    },
  },
  {
    // public/js は ES モジュール形式のブラウザスクリプト。
    files: ['public/js/**/*.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: true,
        it: true,
        test: true,
        expect: true,
        beforeAll: true,
        afterAll: true,
        beforeEach: true,
        afterEach: true,
        jest: true,
      },
    },
  },
];
