import { describe, it } from 'node:test'
import assert from 'assert'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'

describe('TelemetryErrors', () => {
  it('should have correct error codes in expected ranges', () => {
    assert.strictEqual(Errors.TraceDefinitionRequired.code, -190000)
    assert.strictEqual(Errors.UnrecognizedSpanName.code, -190001)
  })

  it('should contain expected error text in descriptions', () => {
    assert.ok(Errors.TraceDefinitionRequired.description.includes('Trace definition'))
    assert.ok(Errors.UnrecognizedSpanName.description.includes('span name'))
  })

  it('should support parameter substitution in error messages', () => {
    const error = ExceptionHelper.generateException(Error, Errors.UnrecognizedSpanName, undefined, { spanName: 'invalid.span' })
    assert.ok(error.message.includes('invalid.span'))
  })

  it('should have all required properties', () => {
    Object.values(Errors).forEach((error) => {
      assert.ok(error.code, 'Error should have a code')
      assert.ok(error.description, 'Error should have a description')
    })
  })

  it('should have unique error codes', () => {
    const codes = Object.values(Errors).map((error) => error.code)
    const uniqueCodes = new Set(codes)
    assert.strictEqual(codes.length, uniqueCodes.size, 'All error codes should be unique')
  })
})
