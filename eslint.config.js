const tseslint = require('@typescript-eslint/eslint-plugin')
const tsParser = require('@typescript-eslint/parser')

module.exports = [
    {
        ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'build/**', 'demo/**']
    },
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module'
            },
            globals: {
                console: 'readonly',
                window: 'readonly',
                navigator: 'readonly',
                self: 'readonly',
                HTMLIFrameElement: 'readonly',
                MessageEvent: 'readonly',
                Promise: 'readonly',
                ServiceWorkerContainer: 'readonly',
                ServiceWorkerRegistration: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': tseslint
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off'
        }
    },
    {
        files: ['test/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module'
            },
            globals: {
                console: 'readonly',
                window: 'readonly',
                navigator: 'readonly',
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                jest: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly'
            }
        },
        plugins: {
            '@typescript-eslint': tseslint
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': 'off'
        }
    }
]
