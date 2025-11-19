import assert from 'assert'
import { describe, it } from 'node:test'
import { AgentErrorDefinition, AgentError, ExceptionHelper } from '../src/exceptionHelper'

describe('AgentErrorDefinition tests', () => {
  it('should create an error definition with all properties', () => {
    const errorDef: AgentErrorDefinition = {
      code: -100000,
      description: 'Test error message',
      helplink: 'https://aka.ms/test'
    }

    assert.strictEqual(errorDef.code, -100000)
    assert.strictEqual(errorDef.description, 'Test error message')
    assert.strictEqual(errorDef.helplink, 'https://aka.ms/test')
  })

  it('should have all required properties', () => {
    const errorDef: AgentErrorDefinition = {
      code: -100001,
      description: 'Test error',
      helplink: 'https://aka.ms/test'
    }

    assert.ok(Object.prototype.hasOwnProperty.call(errorDef, 'code'))
    assert.ok(Object.prototype.hasOwnProperty.call(errorDef, 'description'))
    assert.ok(Object.prototype.hasOwnProperty.call(errorDef, 'helplink'))
  })
})

describe('ExceptionHelper tests', () => {
  it('should generate exception with error code and help link', () => {
    const errorDef: AgentErrorDefinition = {
      code: -100000,
      description: 'Test error',
      helplink: 'https://aka.ms/test'
    }

    const exception = ExceptionHelper.generateException(Error, errorDef)

    assert.strictEqual(exception.message, 'Test error')
    assert.strictEqual(exception.code, -100000)
    assert.strictEqual(exception.helpLink, 'https://aka.ms/test')
  })

  it('should generate ReferenceError exception', () => {
    const errorDef: AgentErrorDefinition = {
      code: -100000,
      description: 'Reference error test',
      helplink: 'https://aka.ms/test'
    }

    const exception = ExceptionHelper.generateException(ReferenceError, errorDef)

    assert.ok(exception instanceof ReferenceError)
    assert.strictEqual(exception.message, 'Reference error test')
    assert.strictEqual(exception.code, -100000)
    assert.strictEqual(exception.helpLink, 'https://aka.ms/test')
  })

  it('should generate exception with inner exception', () => {
    const innerError = new Error('Inner error')
    const errorDef: AgentErrorDefinition = {
      code: -100000,
      description: 'Test error',
      helplink: 'https://aka.ms/test'
    }

    const exception = ExceptionHelper.generateException(Error, errorDef, innerError)

    assert.strictEqual(exception.message, 'Test error')
    assert.strictEqual(exception.code, -100000)
    assert.strictEqual(exception.innerException, innerError)
  })

  it('should format message with single parameter', () => {
    const errorDef: AgentErrorDefinition = {
      code: -100006,
      description: 'Cannot use invalid Row Key characters: {keySuffix} in keySuffix',
      helplink: 'https://aka.ms/test'
    }

    const exception = ExceptionHelper.generateException(Error, errorDef, undefined, { keySuffix: 'test*suffix' })

    assert.strictEqual(
      exception.message,
      'Cannot use invalid Row Key characters: test*suffix in keySuffix'
    )
  })

  it('should format message with multiple parameters', () => {
    const errorDef: AgentErrorDefinition = {
      code: -100009,
      description: 'Custom Partition Key Paths are not supported. {containerId} has a custom Partition Key Path of {partitionKeyPath}.',
      helplink: 'https://aka.ms/test'
    }

    const exception = ExceptionHelper.generateException(
      Error,
      errorDef,
      undefined,
      {
        containerId: 'myContainer',
        partitionKeyPath: '/customPath'
      }
    )

    assert.strictEqual(
      exception.message,
      'Custom Partition Key Paths are not supported. myContainer has a custom Partition Key Path of /customPath.'
    )
  })

  it('should handle message with no parameters', () => {
    const errorDef: AgentErrorDefinition = {
      code: -100000,
      description: 'Simple error message',
      helplink: 'https://aka.ms/test'
    }

    const exception = ExceptionHelper.generateException(Error, errorDef)

    assert.strictEqual(exception.message, 'Simple error message')
  })

  it('should throw and catch exception correctly', () => {
    const errorDef: AgentErrorDefinition = {
      code: -100000,
      description: 'Test error',
      helplink: 'https://aka.ms/test'
    }

    assert.throws(
      () => {
        throw ExceptionHelper.generateException(ReferenceError, errorDef)
      },
      (err: ReferenceError & AgentError) => {
        return (
          err instanceof ReferenceError &&
          err.message === 'Test error' &&
          err.code === -100000 &&
          err.helpLink === 'https://aka.ms/test'
        )
      }
    )
  })
})
