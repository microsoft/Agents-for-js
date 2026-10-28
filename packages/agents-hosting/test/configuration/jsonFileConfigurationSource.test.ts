/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'node:assert'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { inspect } from 'node:util'
import {
  createConfigurationContext,
  getConfigurationSnapshot
} from '../../src/configuration/configuration'
import { createJsonFileConfigurationSource } from '../../src/configuration/jsonFileConfigurationSource'
import { Errors } from '../../src/errorHelper'

interface ConfigurationTestError extends Error {
  code?: number
  innerException?: Error & { code?: number }
}

describe('createJsonFileConfigurationSource', () => {
  let testFolder: string

  beforeEach(async () => {
    testFolder = await mkdtemp(join(tmpdir(), 'agents-json-configuration-'))
  })

  afterEach(async () => {
    await rm(testFolder, { recursive: true, force: true })
  })

  it('loads a hierarchical configuration document', async () => {
    const filePath = join(testFolder, 'config.json')
    await writeFile(filePath, JSON.stringify({
      cloudAdapterOptions: {
        emitStackTrace: true
      },
      outboundHostValidator: {
        enabled: true,
        hosts: ['api.example.com']
      }
    }))

    const context = await createConfigurationContext([{
      source: createJsonFileConfigurationSource(filePath),
      mode: 'overrideEnvironment'
    }])
    const configuration = getConfigurationSnapshot(context).overrideEnvironment

    assert.equal(configuration.cloudAdapterOptions.emitStackTrace, true)
    assert.equal(configuration.outboundHostValidator.enabled, true)
    assert.deepEqual(configuration.outboundHostValidator.hosts, ['api.example.com'])
  })

  it('preserves a sanitized missing-file error as the inner exception', async () => {
    const filePath = join(testFolder, 'missing.json')

    await assert.rejects(
      createConfigurationContext([{
        source: createJsonFileConfigurationSource(filePath),
        mode: 'overrideEnvironment'
      }]),
      (error: ConfigurationTestError) => {
        assert.equal(error.code, Errors.ConfigurationSourceLoadFailed.code)
        assert.equal(error.innerException?.code, Errors.JsonConfigurationFileReadFailed.code)
        assert.match(error.innerException?.message ?? '', /missing\.json/)
        return true
      }
    )
  })

  it('rejects malformed JSON without retaining file contents', async () => {
    const leakedValue = 'malformed-json-secret'
    const filePath = join(testFolder, 'invalid.json')
    await writeFile(filePath, `{"clientSecret":"${leakedValue}",`)

    await assert.rejects(
      createConfigurationContext([{
        source: createJsonFileConfigurationSource(filePath),
        mode: 'overrideEnvironment'
      }]),
      (error: ConfigurationTestError) => {
        assert.equal(error.code, Errors.ConfigurationSourceLoadFailed.code)
        assert.equal(error.innerException?.code, Errors.InvalidJsonConfigurationFile.code)
        assert.equal(inspect(error).includes(leakedValue), false)
        assert.equal(JSON.stringify(error).includes(leakedValue), false)
        return true
      }
    )
  })

  it('rejects a non-object root without retaining its value', async () => {
    const leakedValue = 'non-object-root-secret'
    const filePath = join(testFolder, 'invalid-root.json')
    await writeFile(filePath, JSON.stringify(leakedValue))

    await assert.rejects(
      createConfigurationContext([{
        source: createJsonFileConfigurationSource(filePath),
        mode: 'overrideEnvironment'
      }]),
      (error: ConfigurationTestError) => {
        assert.equal(error.code, Errors.ConfigurationSourceLoadFailed.code)
        assert.equal(error.innerException?.code, Errors.JsonConfigurationDocumentRequired.code)
        assert.equal(inspect(error).includes(leakedValue), false)
        assert.equal(JSON.stringify(error).includes(leakedValue), false)
        return true
      }
    )
  })

  it('does not retain an arbitrary source error that copies a helper error code', async () => {
    const leakedValue = 'forged-helper-error-secret'
    const forgedError = new Error(leakedValue) as ConfigurationTestError
    forgedError.code = Errors.InvalidJsonConfigurationFile.code

    await assert.rejects(
      createConfigurationContext([{
        source: {
          name: 'forged-json-source',
          async load () {
            throw forgedError
          }
        },
        mode: 'overrideEnvironment'
      }]),
      (error: ConfigurationTestError) => {
        assert.equal(error.code, Errors.ConfigurationSourceLoadFailed.code)
        assert.equal(error.innerException, undefined)
        assert.equal(inspect(error).includes(leakedValue), false)
        return true
      }
    )
  })
})
