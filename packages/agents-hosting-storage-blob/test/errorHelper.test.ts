import { describe, it } from 'node:test'
import assert from 'assert'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'

describe('BlobStorageErrors', () => {
  it('should have correct error codes', () => {
    assert.strictEqual(Errors.InvalidTimestamp.code, -160000)
    assert.strictEqual(Errors.EmptyKeyProvided.code, -160001)
    assert.strictEqual(Errors.ETagConflict.code, -160002)
  })

  it('should contain error message in description', () => {
    assert.ok(Errors.InvalidTimestamp.description.includes('timestamp'))
    assert.ok(Errors.EmptyKeyProvided.description.includes('empty key'))
    assert.ok(Errors.ETagConflict.description.includes('eTag conflict'))
  })

  it('should support parameter substitution in error messages', () => {
    const error = ExceptionHelper.generateException(Error, Errors.ETagConflict, undefined, { key: 'test-key' })
    assert.ok(error.message.includes('test-key'))
  })

  it('should have all required properties', () => {
    Object.values(Errors).forEach((error) => {
      assert.ok(error.code, 'Error should have a code')
      assert.ok(error.description, 'Error should have a description')
      // helplink is optional and will use the default from ExceptionHelper when not provided
    })
  })

  it('should have unique error codes', () => {
    const codes = Object.values(Errors).map((error) => error.code)
    const uniqueCodes = new Set(codes)
    assert.strictEqual(codes.length, uniqueCodes.size, 'All error codes should be unique')
  })
})
