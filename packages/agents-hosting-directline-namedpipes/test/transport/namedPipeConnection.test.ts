// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { assertWindowsPlatform, getPipePath, NamedPipeConnection, validatePipeName } from '../../src/transport/namedPipeConnection.js'

describe('NamedPipeConnection', () => {
  describe('getPipePath', () => {
    it('should return the Windows pipe path', (context) => {
      if (process.platform !== 'win32') {
        context.skip('Named pipe hosting is Windows-only')
        return
      }
      assert.strictEqual(getPipePath('test.pipes'), '\\\\.\\pipe\\test.pipes')
      assert.strictEqual(getPipePath('bfv4.pipes'), '\\\\.\\pipe\\bfv4.pipes')
    })

    it('should reject unsafe path components', (context) => {
      if (process.platform !== 'win32') {
        context.skip('Named pipe hosting is Windows-only')
        return
      }
      for (const name of ['', '..', '../escape', 'escape/name', 'escape\\name', ' pipe', 'pipe ', 'pipe$name']) {
        assert.throws(() => getPipePath(name), /Invalid named pipe name/)
      }
    })

    it('should throw on non-Windows platforms', (context) => {
      if (process.platform === 'win32') {
        context.skip('Test asserts non-Windows behavior')
        return
      }
      assert.throws(() => getPipePath('test.pipes'), /Named pipe hosting is only supported on Windows/)
    })
  })

  describe('validatePipeName', () => {
    it('should accept documented pipe name characters', () => {
      assert.doesNotThrow(() => validatePipeName('bfv4.pipes'))
      assert.doesNotThrow(() => validatePipeName('my-custom_pipe.1'))
    })

    it('should reject unsafe public pipe names', () => {
      const tooLong = 'a'.repeat(79)
      for (const name of ['', '..', '../escape', 'escape/name', 'escape\\name', ' pipe', 'pipe ', 'pipe$name', tooLong]) {
        assert.throws(() => validatePipeName(name), /Invalid named pipe name/)
      }
    })
  })

  describe('assertWindowsPlatform', () => {
    it('matches the current process platform', () => {
      if (process.platform === 'win32') {
        assert.doesNotThrow(() => assertWindowsPlatform())
      } else {
        assert.throws(() => assertWindowsPlatform(), /Named pipe hosting is only supported on Windows/)
      }
    })
  })

  describe('NamedPipeConnection constructor', () => {
    it('throws PipePlatformNotSupported on non-Windows platforms', (context) => {
      if (process.platform === 'win32') {
        context.skip('Test asserts non-Windows behavior')
        return
      }
      assert.throws(() => new NamedPipeConnection('test.pipes'), /Named pipe hosting is only supported on Windows/)
    })
  })
})
