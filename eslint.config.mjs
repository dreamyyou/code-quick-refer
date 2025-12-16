import typescriptEslint from 'typescript-eslint';
import customRules from './rule/custom-rules.cjs';

export default [
  {
    ignores: ['dist/**', 'out/**', 'node_modules/**'],
  },
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': typescriptEslint.plugin,
      'custom-rules': customRules,
    },
    languageOptions: {
      parser: typescriptEslint.parser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/naming-convention': [
        'warn',
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
      ],

      curly: 'warn',
      eqeqeq: 'warn',
      'no-throw-literal': 'warn',
      semi: 'warn',

      'custom-rules/no-nested-function-definitions': ['error'],
      'custom-rules/single-line-arrow-body': ['error'],
      'custom-rules/no-inline-function-types': ['error'],
    },
  },
  {
    files: ['src/test/**/*.ts'],
    rules: {
      'custom-rules/no-nested-function-definitions': 'off',
    },
  },
];
