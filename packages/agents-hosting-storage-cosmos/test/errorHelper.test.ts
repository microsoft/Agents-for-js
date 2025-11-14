import assert from 'assert'
import { describe, it } from 'node:test'
import { AgentErrorDefinition, ErrorHelper, ExceptionHelper } from '../src/errorHelper'

describe('AgentErrorDefinition tests', () => {
  it('should create an error definition with all properties', () => {
    const errorDef = new AgentErrorDefinition(-100000, 'Test error message', 'https://aka.ms/test')

    assert.strictEqual(errorDef.code, -100000)
    assert.strictEqual(errorDef.description, 'Test error message')
    assert.strictEqual(errorDef.helplink, 'https://aka.ms/test')
  })

  it('should have readonly properties', () => {
    const errorDef = new AgentErrorDefinition(-100001, 'Test error', 'https://aka.ms/test')

    // TypeScript enforces readonly at compile time, but we can verify the properties exist
    assert.ok(Object.prototype.hasOwnProperty.call(errorDef, 'code'))
    assert.ok(Object.prototype.hasOwnProperty.call(errorDef, 'description'))
    assert.ok(Object.prototype.hasOwnProperty.call(errorDef, 'helplink'))
  })
})

describe('ErrorHelper tests', () => {
  it('should have MissingCosmosDbStorageOptions error definition', () => {
    const error = ErrorHelper.MissingCosmosDbStorageOptions

    assert.strictEqual(error.code, -100000)
    assert.strictEqual(error.description, 'CosmosDbPartitionedStorageOptions is required.')
    assert.strictEqual(error.helplink, 'https://aka.ms/M365AgentsErrorCodes/#-100000')
  })

  it('should have MissingCosmosEndpoint error definition', () => {
    const error = ErrorHelper.MissingCosmosEndpoint

    assert.strictEqual(error.code, -100001)
    assert.strictEqual(error.description, 'endpoint in cosmosClientOptions is required.')
    assert.strictEqual(error.helplink, 'https://aka.ms/M365AgentsErrorCodes/#-100001')
  })

  it('should have MissingCosmosCredentials error definition', () => {
    const error = ErrorHelper.MissingCosmosCredentials

    assert.strictEqual(error.code, -100002)
    assert.strictEqual(error.description, 'key or tokenProvider in cosmosClientOptions is required.')
    assert.strictEqual(error.helplink, 'https://aka.ms/M365AgentsErrorCodes/#-100002')
  })

  it('should have all error codes in the correct range', () => {
    const errorDefinitions = Object.values(ErrorHelper).filter(
      val => val instanceof AgentErrorDefinition
    ) as AgentErrorDefinition[]

    // All error codes should be negative and in the range -100000 to -100019
    errorDefinitions.forEach(errorDef => {
      assert.ok(errorDef.code < 0, `Error code ${errorDef.code} should be negative`)
      assert.ok(errorDef.code >= -100019, `Error code ${errorDef.code} should be >= -100019`)
      assert.ok(errorDef.code <= -100000, `Error code ${errorDef.code} should be <= -100000`)
    })
  })

  it('should have unique error codes', () => {
    const errorDefinitions = Object.values(ErrorHelper).filter(
      val => val instanceof AgentErrorDefinition
    ) as AgentErrorDefinition[]

    const codes = errorDefinitions.map(e => e.code)
    const uniqueCodes = new Set(codes)

    assert.strictEqual(codes.length, uniqueCodes.size, 'All error codes should be unique')
  })

  it('should have help links with correct format', () => {
    const errorDefinitions = Object.values(ErrorHelper).filter(
      val => val instanceof AgentErrorDefinition
    ) as AgentErrorDefinition[]

    errorDefinitions.forEach(errorDef => {
      assert.ok(
        errorDef.helplink.startsWith('https://aka.ms/M365AgentsErrorCodes/#'),
        `Help link should start with correct URL: ${errorDef.helplink}`
      )
      assert.ok(
        errorDef.helplink.endsWith(errorDef.code.toString()),
        `Help link should end with error code: ${errorDef.helplink}`
      )
    })
  })

  it('should have non-empty descriptions', () => {
    const errorDefinitions = Object.values(ErrorHelper).filter(
      val => val instanceof AgentErrorDefinition
    ) as AgentErrorDefinition[]

    errorDefinitions.forEach(errorDef => {
      assert.ok(errorDef.description.length > 0, 'Description should not be empty')
    })
  })
})

describe('ExceptionHelper tests', () => {
  it('should generate exception with error code and help link', () => {
    const errorDef = new AgentErrorDefinition(-100000, 'Test error', 'https://aka.ms/test')

    const exception = ExceptionHelper.generateException(Error, errorDef)

    assert.strictEqual(exception.message, 'Test error')
    assert.strictEqual((exception as any).code, -100000)
    assert.strictEqual((exception as any).helpLink, 'https://aka.ms/test')
  })

  it('should generate ReferenceError exception', () => {
    const exception = ExceptionHelper.generateException(
      ReferenceError,
      ErrorHelper.MissingCosmosDbStorageOptions
    )

    assert.ok(exception instanceof ReferenceError)
    assert.strictEqual(exception.message, 'CosmosDbPartitionedStorageOptions is required.')
    assert.strictEqual((exception as any).code, -100000)
    assert.strictEqual((exception as any).helpLink, 'https://aka.ms/M365AgentsErrorCodes/#-100000')
  })

  it('should generate exception with inner exception', () => {
    const innerError = new Error('Inner error')
    const errorDef = new AgentErrorDefinition(-100000, 'Test error', 'https://aka.ms/test')

    const exception = ExceptionHelper.generateException(Error, errorDef, innerError)

    assert.strictEqual(exception.message, 'Test error')
    assert.strictEqual((exception as any).code, -100000)
  })

  it('should format message with single parameter', () => {
    const errorDef = new AgentErrorDefinition(
      -100006,
      'Cannot use invalid Row Key characters: {0} in keySuffix',
      'https://aka.ms/test'
    )

    const exception = ExceptionHelper.generateException(Error, errorDef, undefined, 'test*suffix')

    assert.strictEqual(
      exception.message,
      'Cannot use invalid Row Key characters: test*suffix in keySuffix'
    )
  })

  it('should format message with multiple parameters', () => {
    const errorDef = new AgentErrorDefinition(
      -100009,
      'Custom Partition Key Paths are not supported. {0} has a custom Partition Key Path of {1}.',
      'https://aka.ms/test'
    )

    const exception = ExceptionHelper.generateException(
      Error,
      errorDef,
      undefined,
      'myContainer',
      '/customPath'
    )

    assert.strictEqual(
      exception.message,
      'Custom Partition Key Paths are not supported. myContainer has a custom Partition Key Path of /customPath.'
    )
  })

  it('should handle message with no parameters', () => {
    const errorDef = new AgentErrorDefinition(-100000, 'Simple error message', 'https://aka.ms/test')

    const exception = ExceptionHelper.generateException(Error, errorDef)

    assert.strictEqual(exception.message, 'Simple error message')
  })

  it('should throw and catch exception correctly', () => {
    assert.throws(
      () => {
        throw ExceptionHelper.generateException(
          ReferenceError,
          ErrorHelper.MissingCosmosDbStorageOptions
        )
      },
      (err: any) => {
        return (
          err instanceof ReferenceError &&
          err.message === 'CosmosDbPartitionedStorageOptions is required.' &&
          err.code === -100000 &&
          err.helpLink === 'https://aka.ms/M365AgentsErrorCodes/#-100000'
        )
      }
    )
  })
})

describe('ErrorHelper integration tests', () => {
  it('should work with InvalidKeySuffixCharacters error', () => {
    const exception = ExceptionHelper.generateException(
      ReferenceError,
      ErrorHelper.InvalidKeySuffixCharacters,
      undefined,
      'invalid*suffix'
    )

    assert.ok(exception instanceof ReferenceError)
    assert.strictEqual(
      exception.message,
      'Cannot use invalid Row Key characters: invalid*suffix in keySuffix'
    )
    assert.strictEqual((exception as any).code, -100006)
  })

  it('should work with UnsupportedCustomPartitionKeyPath error', () => {
    const exception = ExceptionHelper.generateException(
      Error,
      ErrorHelper.UnsupportedCustomPartitionKeyPath,
      undefined,
      'myContainer',
      '/custom'
    )

    assert.ok(exception instanceof Error)
    assert.strictEqual(
      exception.message,
      'Custom Partition Key Paths are not supported. myContainer has a custom Partition Key Path of /custom.'
    )
    assert.strictEqual((exception as any).code, -100009)
  })

  it('should work with ContainerNotFound error', () => {
    const exception = ExceptionHelper.generateException(
      Error,
      ErrorHelper.ContainerNotFound,
      undefined,
      'myContainer'
    )

    assert.strictEqual(exception.message, 'Container myContainer not found.')
    assert.strictEqual((exception as any).code, -100010)
  })

  it('should work with InitializationError', () => {
    const exception = ExceptionHelper.generateException(
      Error,
      ErrorHelper.InitializationError,
      undefined,
      'myDatabase',
      'myContainer'
    )

    assert.strictEqual(
      exception.message,
      'Failed to initialize Cosmos DB database/container: myDatabase/myContainer'
    )
    assert.strictEqual((exception as any).code, -100018)
  })

  it('should work with MaxNestingDepthExceeded error', () => {
    const exception = ExceptionHelper.generateException(
      Error,
      ErrorHelper.MaxNestingDepthExceeded,
      undefined,
      '127',
      'Additional context message'
    )

    assert.strictEqual(
      exception.message,
      'Maximum nesting depth of 127 exceeded. Additional context message'
    )
    assert.strictEqual((exception as any).code, -100019)
  })
})
