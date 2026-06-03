import neostandard from 'neostandard'

export default [
  ...neostandard({ ts: true, ignores: ['node_modules', '**/dist/**'] }),
  {
    files: ['packages/agents-telemetry/src/**/*.{ts,cts,mts}'],
    languageOptions: {
      parser: neostandard.plugins['typescript-eslint'].parser,
    },
    plugins: {
      n: neostandard.plugins.n,
    },
    rules: {
      'n/file-extension-in-import': ['error', 'always'],
    },
  }
]
