// @ts-check

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default defineConfig(
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [importPlugin.flatConfigs.recommended, importPlugin.flatConfigs.typescript],
  },
  eslintPluginPrettierRecommended,
  // chai assertions are sometimes expressions
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-use-before-define': ['error', { functions: false, classes: false }],
      '@typescript-eslint/explicit-function-return-type': [1, { allowExpressions: true }],
      'eol-last': ['error'],
      'space-infix-ops': ['error', { int32Hint: false }],
      'no-multi-spaces': ['error', { ignoreEOLComments: true }],
      'keyword-spacing': ['error'],
    },
  }
);
