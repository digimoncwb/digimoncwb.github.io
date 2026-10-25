module.exports = [
    {
        ignores: [
            'node_modules/**',
            'backup/**',
            '.tmp/**',
            'demo-v2/mfe/**',
            'demo-v2/app-shell/**'
        ]
    },
    {
        files: ['eslint.config.js', 'tests/**/*.js', 'scripts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'readonly',
                process: 'readonly',
                console: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                fetch: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                AbortController: 'readonly',
                AbortSignal: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                Headers: 'readonly',
                TextEncoder: 'readonly',
                setImmediate: 'readonly',
                Event: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-undef': 'error'
        }
    },
    {
        files: ['db.js', 'shared/posts/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                document: 'readonly',
                Image: 'readonly',
                Path2D: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-undef': 'error'
        }
    },
    {
        files: ['sw.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                self: 'readonly',
                caches: 'readonly',
                fetch: 'readonly',
                Response: 'readonly',
                Request: 'readonly',
                URL: 'readonly',
                console: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-undef': 'error'
        }
    },
    {
        files: ['**/*.js'],
        ignores: [
            'eslint.config.js',
            'tests/**/*.js',
            'scripts/**/*.js',
            'db.js',
            'sw.js',
            'shared/posts/**/*.js'
        ],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                localStorage: 'readonly',
                fetch: 'readonly',
                alert: 'readonly',
                confirm: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                Event: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': 'off',
            'no-undef': 'off'
        }
    }
];
