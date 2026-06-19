// @ts-check

import { join } from 'node:path';
import js from '@eslint/js';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import tseslint from 'typescript-eslint';
import { flatConfigs, createNodeResolver } from 'eslint-plugin-import-x';
import prettierPlugin from 'eslint-plugin-prettier';

export default defineConfig(
  includeIgnoreFile(join(import.meta.dirname, '.gitignore')),
  js.configs.recommended,
  tseslint.configs.recommended,
  flatConfigs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
    plugins: {
      prettier: prettierPlugin,
    },
    settings: {
      'import-x/resolver-next': [createNodeResolver()],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [flatConfigs.typescript],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-use-before-define': ['error', { functions: false, classes: false }],
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],
    },
  },
  {
    rules: {
      'import-x/no-unresolved': 'off',
      'prettier/prettier': 'error',
    },
  },
  // chai assertions are sometimes expressions
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  }
);
