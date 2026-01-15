import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'

import { AgentApplication } from './../../../src/app'
import { MemoryStorage } from '../../../src/storage'
import { AzureBotAuthorizationOptions } from '../../../src/app/auth/handlers'

describe('AuthorizationManager', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // Constructor options priority over env variables
  it('should use constructor options over legacy env variables', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'EnvConnection',
      testAuth_connectionTitle: 'Env Title',
      testAuth_connectionText: 'Env Text',
      testAuth_maxAttempts: '5',
      testAuth_obo_connection: 'EnvOboConnection',
      testAuth_obo_scopes: 'env.scope1,env.scope2'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          name: 'ConstructorConnection',
          title: 'Constructor Title',
          text: 'Constructor Text',
          maxAttempts: 3,
          obo: {
            connection: 'ConstructorOboConnection',
            scopes: ['constructor.scope1', 'constructor.scope2']
          }
        }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.azureBotOAuthConnectionName, 'ConstructorConnection')
    assert.equal(authHandler.title, 'Constructor Title')
    assert.equal(authHandler.text, 'Constructor Text')
    assert.equal(authHandler.invalidSignInRetryMax, 3)
    assert.equal(authHandler.oboConnectionName, 'ConstructorOboConnection')
    assert.deepEqual(authHandler.oboScopes, ['constructor.scope1', 'constructor.scope2'])
  })

  it('should use constructor options over latest env variables', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__azureBotOAuthConnectionName`]: 'EnvConnection',
      [`${key}__title`]: 'Env Title',
      [`${key}__text`]: 'Env Text',
      [`${key}__invalidSignInRetryMax`]: '5',
      [`${key}__oboConnectionName`]: 'EnvOboConnection',
      [`${key}__oboScopes`]: 'env.scope1,env.scope2'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          azureBotOAuthConnectionName: 'ConstructorConnection',
          title: 'Constructor Title',
          text: 'Constructor Text',
          invalidSignInRetryMax: 3,
          oboConnectionName: 'ConstructorOboConnection',
          oboScopes: ['constructor.scope1', 'constructor.scope2']
        }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.azureBotOAuthConnectionName, 'ConstructorConnection')
    assert.equal(authHandler.title, 'Constructor Title')
    assert.equal(authHandler.text, 'Constructor Text')
    assert.equal(authHandler.invalidSignInRetryMax, 3)
    assert.equal(authHandler.oboConnectionName, 'ConstructorOboConnection')
    assert.deepEqual(authHandler.oboScopes, ['constructor.scope1', 'constructor.scope2'])
  })

  // Env variables as fallback
  it('should use legacy env variables when constructor options are undefined', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'EnvConnection',
      testAuth_connectionTitle: 'Env Title',
      testAuth_connectionText: 'Env Text',
      testAuth_maxAttempts: '5',
      testAuth_messages_invalidCode: 'Custom invalid code message',
      testAuth_messages_invalidCodeFormat: 'Custom format message',
      testAuth_messages_maxAttemptsExceeded: 'Custom max attempts message',
      testAuth_obo_connection: 'EnvOboConnection',
      testAuth_obo_scopes: 'env.scope1,env.scope2',
      testAuth_enableSso: 'true'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: { name: undefined } // triggers legacy mode
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.azureBotOAuthConnectionName, 'EnvConnection')
    assert.equal(authHandler.title, 'Env Title')
    assert.equal(authHandler.text, 'Env Text')
    assert.equal(authHandler.invalidSignInRetryMax, 5)
    assert.equal(authHandler.invalidSignInRetryMessage, 'Custom invalid code message')
    assert.equal(authHandler.invalidSignInRetryMessageFormat, 'Custom format message')
    assert.equal(authHandler.invalidSignInRetryMaxExceededMessage, 'Custom max attempts message')
    assert.equal(authHandler.oboConnectionName, 'EnvOboConnection')
    assert.deepEqual(authHandler.oboScopes, ['env.scope1', 'env.scope2'])
    assert.equal(authHandler.enableSso, true)
  })

  it('should use latest env variables when constructor options are undefined', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__azureBotOAuthConnectionName`]: 'EnvConnection',
      [`${key}__title`]: 'Env Title',
      [`${key}__text`]: 'Env Text',
      [`${key}__invalidSignInRetryMax`]: '5',
      [`${key}__invalidSignInRetryMessage`]: 'Custom invalid code message',
      [`${key}__invalidSignInRetryMessageFormat`]: 'Custom format message',
      [`${key}__invalidSignInRetryMaxExceededMessage`]: 'Custom max attempts message',
      [`${key}__oboConnectionName`]: 'EnvOboConnection',
      [`${key}__oboScopes`]: 'env.scope1,env.scope2',
      [`${key}__enableSso`]: 'true'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.azureBotOAuthConnectionName, 'EnvConnection')
    assert.equal(authHandler.title, 'Env Title')
    assert.equal(authHandler.text, 'Env Text')
    assert.equal(authHandler.invalidSignInRetryMax, 5)
    assert.equal(authHandler.invalidSignInRetryMessage, 'Custom invalid code message')
    assert.equal(authHandler.invalidSignInRetryMessageFormat, 'Custom format message')
    assert.equal(authHandler.invalidSignInRetryMaxExceededMessage, 'Custom max attempts message')
    assert.equal(authHandler.oboConnectionName, 'EnvOboConnection')
    assert.deepEqual(authHandler.oboScopes, ['env.scope1', 'env.scope2'])
    assert.equal(authHandler.enableSso, true)
  })

  // oboScopes parsing
  it('should parse oboScopes with comma delimiter from legacy env', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection',
      testAuth_obo_scopes: 'scope1,scope2,scope3'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.deepEqual(authHandler.oboScopes, ['scope1', 'scope2', 'scope3'])
  })

  it('should parse oboScopes with space delimiter from legacy env', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection',
      testAuth_obo_scopes: 'scope1 scope2 scope3'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.deepEqual(authHandler.oboScopes, ['scope1', 'scope2', 'scope3'])
  })

  it('should parse oboScopes with comma delimiter from latest env', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__azureBotOAuthConnectionName`]: 'TestConnection',
      [`${key}__oboScopes`]: 'scope1,scope2,scope3'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.deepEqual(authHandler.oboScopes, ['scope1', 'scope2', 'scope3'])
  })

  it('should parse oboScopes with space delimiter from latest env', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__azureBotOAuthConnectionName`]: 'TestConnection',
      [`${key}__oboScopes`]: 'scope1 scope2 scope3'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.deepEqual(authHandler.oboScopes, ['scope1', 'scope2', 'scope3'])
  })

  it('should handle oboScopes with extra whitespace around scopes', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection',
      testAuth_obo_scopes: '  scope1  ,  scope2  ,  scope3  '
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.deepEqual(authHandler.oboScopes, ['scope1', 'scope2', 'scope3'])
  })

  it('should handle oboScopes with multiple spaces between scopes', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection',
      testAuth_obo_scopes: 'scope1    scope2    scope3'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.deepEqual(authHandler.oboScopes, ['scope1', 'scope2', 'scope3'])
  })

  it('should handle oboScopes with tabs and newlines as whitespace delimiters', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection',
      testAuth_obo_scopes: 'scope1\tscope2\nscope3'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.deepEqual(authHandler.oboScopes, ['scope1', 'scope2', 'scope3'])
  })

  it('should return empty array when oboScopes env is not set', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.deepEqual(authHandler.oboScopes, [])
  })

  it('should prefer comma delimiter when string contains both comma and space', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection',
      testAuth_obo_scopes: 'scope1, scope2, scope3'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.deepEqual(authHandler.oboScopes, ['scope1', 'scope2', 'scope3'])
  })

  // invalidSignInRetryMax parsing
  it('should parse invalidSignInRetryMax as integer from legacy env', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection',
      testAuth_maxAttempts: '7'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.invalidSignInRetryMax, 7)
  })

  it('should parse invalidSignInRetryMax as integer from latest env', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__azureBotOAuthConnectionName`]: 'TestConnection',
      [`${key}__invalidSignInRetryMax`]: '10'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.invalidSignInRetryMax, 10)
  })

  // enableSso parsing
  it('should default enableSso to true when not set', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.enableSso, true)
  })

  it('should set enableSso to false when env is "false"', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection',
      testAuth_enableSso: 'false'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.enableSso, false)
  })

  it('should set enableSso to true when env is "true"', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection',
      testAuth_enableSso: 'true'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.enableSso, true)
  })

  it('should use constructor enableSso over env variable', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestConnection',
      testAuth_enableSso: 'true'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          enableSso: false
        }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.enableSso, false)
  })

  // Legacy vs Latest env variable naming
  it('should use latest env when no legacy constructor options are provided', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__azureBotOAuthConnectionName`]: 'LatestEnvConnection',
      [`${key}__title`]: 'Latest Title'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {}
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.azureBotOAuthConnectionName, 'LatestEnvConnection')
    assert.equal(authHandler.title, 'Latest Title')
  })

  // Deprecated options mapping
  it('should map deprecated "name" to azureBotOAuthConnectionName', () => {
    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          name: 'DeprecatedConnectionName'
        }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.azureBotOAuthConnectionName, 'DeprecatedConnectionName')
  })

  it('should map deprecated "maxAttempts" to invalidSignInRetryMax', () => {
    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          name: 'TestConnection',
          maxAttempts: 5
        }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.invalidSignInRetryMax, 5)
  })

  it('should map deprecated "messages" to individual message properties', () => {
    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          name: 'TestConnection',
          messages: {
            invalidCode: 'Custom invalid code',
            invalidCodeFormat: 'Custom format',
            maxAttemptsExceeded: 'Custom max attempts'
          }
        }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.invalidSignInRetryMessage, 'Custom invalid code')
    assert.equal(authHandler.invalidSignInRetryMessageFormat, 'Custom format')
    assert.equal(authHandler.invalidSignInRetryMaxExceededMessage, 'Custom max attempts')
  })

  it('should map deprecated "obo" to oboConnectionName and oboScopes', () => {
    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          name: 'TestConnection',
          obo: {
            connection: 'OboConnection',
            scopes: ['scope1', 'scope2']
          }
        }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.oboConnectionName, 'OboConnection')
    assert.deepEqual(authHandler.oboScopes, ['scope1', 'scope2'])
  })

  // Default values
  it('should set default title when not provided', () => {
    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          name: 'TestConnection'
        }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.title, 'Sign-in')
  })

  it('should set default text when not provided', () => {
    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          name: 'TestConnection'
        }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.text, 'Please sign-in to continue')
  })

  // Error handling
  it('should throw when azureBotOAuthConnectionName is not provided with latest options', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    assert.throws(() => {
      const app = new AgentApplication({
        storage: new MemoryStorage(),
        authorization: {
          testAuth: {}
        }
      })
      assert.equal(app, undefined)
    }, { message: `[handler:testAuth] The 'azureBotOAuthConnectionName' property or '${key}__azureBotOAuthConnectionName' env variable is required to initialize the handler.` })
  })

  // AgenticUserAuthorization type tests
  it('should create AgenticAuthorization handler when type is AgenticUserAuthorization', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__scopes`]: 'scope1,scope2'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          type: 'AgenticUserAuthorization'
        }
      }
    })

    const handler = (app.authorization as any).manager._handlers['testAuth']
    assert.equal(handler.constructor.name, 'AgenticAuthorization')
  })

  it('should create AgenticAuthorization handler when type is agentic (deprecated)', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__scopes`]: 'scope1,scope2'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          type: 'agentic'
        } as any
      }
    })

    const handler = (app.authorization as any).manager._handlers['testAuth']
    assert.equal(handler.constructor.name, 'AgenticAuthorization')
  })

  it('should load agentic scopes from latest env variables', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__scopes`]: 'scope1,scope2,scope3'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          type: 'AgenticUserAuthorization'
        }
      }
    })

    const handler = (app.authorization as any).manager._handlers['testAuth']
    assert.deepEqual(handler.options.scopes, ['scope1', 'scope2', 'scope3'])
  })

  it('should load agentic scopes from legacy env variables', () => {
    process.env = {
      ...process.env,
      testAuth_scopes: 'scope1,scope2,scope3'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          type: 'AgenticUserAuthorization'
        }
      }
    })

    const handler = (app.authorization as any).manager._handlers['testAuth']
    assert.deepEqual(handler.options.scopes, ['scope1', 'scope2', 'scope3'])
  })

  it('should use constructor scopes over env variables for agentic handler', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__scopes`]: 'env.scope1,env.scope2'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          type: 'AgenticUserAuthorization',
          scopes: ['constructor.scope1', 'constructor.scope2']
        }
      }
    })

    const handler = (app.authorization as any).manager._handlers['testAuth']
    assert.deepEqual(handler.options.scopes, ['constructor.scope1', 'constructor.scope2'])
  })

  it('should throw when agentic handler has no scopes', () => {
    assert.throws(() => {
      const app = new AgentApplication({
        storage: new MemoryStorage(),
        authorization: {
          testAuth: {
            type: 'AgenticUserAuthorization'
          }
        }
      })
      assert.equal(app, undefined)
    }, { message: '[handler:testAuth] At least one scope must be specified for the Agentic authorization handler.' })
  })

  it('should load agentic altBlueprintConnectionName from env', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__scopes`]: 'scope1',
      [`${key}__altBlueprintConnectionName`]: 'MyAltConnection'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          type: 'AgenticUserAuthorization'
        }
      }
    })

    const handler = (app.authorization as any).manager._handlers['testAuth']
    assert.equal(handler.options.altBlueprintConnectionName, 'MyAltConnection')
  })
})
