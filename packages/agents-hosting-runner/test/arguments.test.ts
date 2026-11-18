// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseRunnerArguments } from '../src/arguments'

describe('runner arguments', () => {
  it('preserves a module path containing spaces', () => {
    assert.deepEqual(parseRunnerArguments([
      '--port', '3978', '--agent-module', 'C:\\agent bundle\\agent.js'
    ]), { port: 3978, agentModulePath: 'C:\\agent bundle\\agent.js' })
  })

  it('handles informational actions without required arguments', () => {
    assert.equal(parseRunnerArguments(['--help']), 'help')
    assert.equal(parseRunnerArguments(['-h']), 'help')
    assert.equal(parseRunnerArguments(['--version']), 'version')
  })

  for (const args of [
    [],
    ['--port', '3978'],
    ['--agent-module', 'agent.js'],
    ['--port', '0', '--agent-module', 'agent.js'],
    ['--port', '65536', '--agent-module', 'agent.js'],
    ['--port', '1.5', '--agent-module', 'agent.js'],
    ['--port', '1e3', '--agent-module', 'agent.js'],
    ['--port', '3978', '--agent-module', ' '],
    ['--port', '3978', '--agent-module', 'agent.js', '--unexpected']
  ]) {
    it(`rejects invalid arguments ${JSON.stringify(args)}`, () => {
      assert.throws(() => parseRunnerArguments(args))
    })
  }
})
