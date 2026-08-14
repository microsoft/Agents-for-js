import assert from 'node:assert'
import { describe, it } from 'node:test'
import type { AuthProvider, Authorization, TurnContext } from '@microsoft/agents-hosting'
import { createAppGraphClient, createUserGraphClient } from '../src/graphClientFactory'

describe('GraphClientFactory', () => {
  const authorization = {} as Authorization
  const context = {} as TurnContext
  const tokenProvider = {} as AuthProvider

  it('should validate delegated Graph client parameters', () => {
    assert.throws(
      () => createUserGraphClient(undefined as unknown as Authorization, context),
      /authorization parameter is required/
    )
    assert.throws(
      () => createUserGraphClient(authorization, undefined as unknown as TurnContext),
      /context parameter is required/
    )
    assert.throws(
      () => createUserGraphClient(authorization, context, undefined, ''),
      /graphBaseUrl parameter is required/
    )
  })

  it('should validate app-only Graph client parameters', () => {
    assert.throws(
      () => createAppGraphClient(undefined as unknown as AuthProvider),
      /tokenProvider parameter is required/
    )
    assert.throws(
      () => createAppGraphClient(tokenProvider, ''),
      /graphBaseUrl parameter is required/
    )
  })

  it('should reject an invalid Graph base URL', () => {
    assert.throws(() => createUserGraphClient(authorization, context, undefined, 'not-a-url'), /graphBaseUrl parameter must be a valid absolute URL/)
    assert.throws(() => createAppGraphClient(tokenProvider, 'not-a-url'), /graphBaseUrl parameter must be a valid absolute URL/)
  })
})
