import neostandard from 'neostandard'
import jsdoc from 'eslint-plugin-jsdoc'

export default [
  ...neostandard({
    ts: true,
    ignores: ['**/node_modules/**', '**/dist/**', 'samples/**', 'test-agents/**', '**/test/**'],
  }),
  jsdoc.configs['flat/recommended-typescript-flavor'],
]
