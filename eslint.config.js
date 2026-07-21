import neostandard from 'neostandard'

export default [
  ...neostandard({ ts: true, ignores: ['node_modules', '**/dist/**'] }),
  {
    files: ['packages/*/src/**/*.{ts,tsx,cts,mts}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ThrowStatement > NewExpression[callee.name='Error']",
          message: 'Use ExceptionHelper.generateException(Error, Errors.YourErrorDefinition) instead of throw new Error(...).'
        },
        {
          selector: "ThrowStatement > NewExpression[callee.name='TypeError']",
          message: 'Use ExceptionHelper.generateException(TypeError, Errors.YourErrorDefinition) instead of throw new TypeError(...).'
        },
        {
          selector: "ThrowStatement > NewExpression[callee.name='ReferenceError']",
          message: 'Use ExceptionHelper.generateException(ReferenceError, Errors.YourErrorDefinition) instead of throw new ReferenceError(...).'
        },
        {
          selector: "ThrowStatement > NewExpression[callee.name='RangeError']",
          message: 'Use ExceptionHelper.generateException(RangeError, Errors.YourErrorDefinition) instead of throw new RangeError(...).'
        },
        {
          selector: "ThrowStatement > NewExpression[callee.name='SyntaxError']",
          message: 'Use ExceptionHelper.generateException(SyntaxError, Errors.YourErrorDefinition) instead of throw new SyntaxError(...).'
        }
      ],
    },
  },
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
