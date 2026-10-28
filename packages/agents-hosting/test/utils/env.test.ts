// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import {
  envParser,
  envParserUtils,
  loadEnvSettings,
  parseBooleanEnv,
  parseIntEnv,
  suggestClosest
} from '../../src/utils/env'

describe('utils/env', () => {
  describe('loadEnvSettings', () => {
    it('indexes non-empty values case-insensitively and invokes the callback in enumeration order', () => {
      const visited: Array<[string, string]> = []
      const loaded = loadEnvSettings(
        (key, value) => visited.push([key, value]),
        {
          First_Key: 'first',
          empty: '',
          whitespace: '   ',
          second_key: 'second'
        }
      )

      assert.deepEqual(visited, [
        ['First_Key', 'first'],
        ['second_key', 'second']
      ])
      assert.deepEqual(loaded, {
        FIRST_KEY: { key: 'First_Key', value: 'first' },
        SECOND_KEY: { key: 'second_key', value: 'second' }
      })
    })
  })

  describe('envParser', () => {
    const parser = envParser<'name' | 'alias'>({
      name: envParserUtils.bypass,
      alias: value => ({ key: 'name', value: value.toUpperCase() })
    })

    it('matches keys case-insensitively and preserves the canonical key', () => {
      assert.deepEqual(parser.parse('NAME', 'value'), { key: 'name', value: 'value' })
    })

    it('returns an empty result for unknown keys', () => {
      assert.deepEqual(parser.parse('unknown', 'value'), {})
    })

    it('supports key redirection and parser composition', () => {
      assert.deepEqual(parser.parse('alias', 'value'), { key: 'name', value: 'VALUE' })

      const redirect = envParserUtils.redirect(parser, 'alias')
      assert.deepEqual(redirect('other'), { key: 'name', value: 'OTHER' })
    })
  })

  describe('parseBooleanEnv', () => {
    it('returns undefined for undefined input', () => {
      assert.equal(parseBooleanEnv(undefined), undefined)
    })

    it('returns undefined for empty string', () => {
      assert.equal(parseBooleanEnv(''), undefined)
      assert.equal(parseBooleanEnv('   '), undefined)
    })

    it('returns true for canonical and case/space variants of true and 1', () => {
      for (const v of ['true', 'TRUE', 'True', ' true ', '1', ' 1 ']) {
        assert.equal(parseBooleanEnv(v), true, `expected ${JSON.stringify(v)} -> true`)
      }
    })

    it('returns false for canonical and case/space variants of false and 0', () => {
      for (const v of ['false', 'FALSE', 'False', ' false ', '0', ' 0 ']) {
        assert.equal(parseBooleanEnv(v), false, `expected ${JSON.stringify(v)} -> false`)
      }
    })

    it('returns undefined for unrecognized values', () => {
      for (const v of ['yes', 'no', 'on', 'off', 'abc', '2']) {
        assert.equal(parseBooleanEnv(v), undefined, `expected ${JSON.stringify(v)} -> undefined`)
      }
    })
  })

  describe('parseIntEnv', () => {
    it('returns fallback for undefined input', () => {
      assert.equal(parseIntEnv(undefined, 42), 42)
    })

    it('returns fallback for empty/whitespace input', () => {
      assert.equal(parseIntEnv('', 42), 42)
      assert.equal(parseIntEnv('   ', 42), 42)
    })

    it('parses valid integer input', () => {
      assert.equal(parseIntEnv('123', 42), 123)
      assert.equal(parseIntEnv('-7', 42), -7)
      assert.equal(parseIntEnv('  10  ', 42), 10)
    })

    it('parses leading-int prefix consistent with parseInt', () => {
      // parseInt('150abc', 10) === 150; documents the existing semantic.
      assert.equal(parseIntEnv('150abc', 42), 150)
    })

    it('returns fallback for non-numeric input', () => {
      assert.equal(parseIntEnv('abc', 42), 42)
      assert.equal(parseIntEnv('NaN', 42), 42)
    })
  })

  describe('suggestClosest', () => {
    const candidates = ['emitStackTrace', 'validateServiceUrl'] as const

    it('returns the matching candidate for a simple typo within distance', () => {
      assert.equal(suggestClosest('validateServiceUrL', candidates), 'validateServiceUrl')
      assert.equal(suggestClosest('emitStakTrace', candidates), 'emitStackTrace')
    })

    it('is case-insensitive', () => {
      assert.equal(suggestClosest('VALIDATESERVICEURL', candidates), 'validateServiceUrl')
      assert.equal(suggestClosest('EmitStackTrace', candidates), 'emitStackTrace')
    })

    it('returns undefined when no candidate is within the max distance', () => {
      assert.equal(suggestClosest('completelyDifferentName', candidates), undefined)
    })

    it('returns undefined for empty input', () => {
      assert.equal(suggestClosest('', candidates), undefined)
    })

    it('respects an explicit maxDistance', () => {
      assert.equal(suggestClosest('validateServiceUrlABC', candidates, 2), undefined)
      assert.equal(suggestClosest('validateServiceUrlAB', candidates, 2), 'validateServiceUrl')
    })

    it('breaks ties by candidate order when distances are equal', () => {
      // Both candidates at distance 1 from 'abcx'; first listed wins.
      assert.equal(suggestClosest('abcx', ['abcd', 'abcz'], 2), 'abcd')
    })

    it('applies a proportional cutoff so short typos do not match distant names', () => {
      // input length 3, cutoff = ceil(3/2) = 2 even though maxDistance is high.
      // Distance from 'abc' to 'wxyzv' is 5, well beyond cutoff.
      assert.equal(suggestClosest('abc', ['wxyzv'], 10), undefined)
    })
  })
})
