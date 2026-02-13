import { strict as assert } from 'assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import sinon from 'sinon'

import { AuthorizationManager } from '../../../src/app/auth/authorizationManager'
import { AgentApplication } from '../../../src/app'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { TurnContext } from '../../../src/turnContext'
import { TestAdapter } from '../testStubs'
import { MemoryStorage } from '../../../src/storage'
import { AuthorizationHandlerStatus } from '../../../src/app/auth/types'
import { HandlerStorage } from '../../../src/app/auth/handlerStorage'
import { Connections } from '../../../src/auth/connections'
import { AzureBotAuthorizationOptions } from '../../../src/app/auth/handlers'

describe('AuthorizationManager - Configuration', () => {
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

  it('should merge constructor options with legacy env variables', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'EnvConnection',
      testAuth_obo_scopes: 'env.scope1,env.scope2'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          maxAttempts: 3,
          obo: {
            connection: 'ConstructorOboConnection',
            scopes: ['constructor.scope1', 'constructor.scope2']
          }
        }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.azureBotOAuthConnectionName, 'EnvConnection')
    assert.equal(authHandler.invalidSignInRetryMax, 3)
    assert.equal(authHandler.oboConnectionName, 'ConstructorOboConnection')
    assert.deepEqual(authHandler.oboScopes, ['constructor.scope1', 'constructor.scope2'])
  })

  it('should use constructor options over latest env variables', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__azureBotOAuthConnectionName`]: 'EnvConnection',
      [`${key}__oboScopes`]: 'env.scope1,env.scope2'
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          azureBotOAuthConnectionName: 'ConstructorConnection',
          // Empty oboScopes
        }
      }
    })

    const authHandler: AzureBotAuthorizationOptions = (app.authorization as any).manager._handlers['testAuth'].options
    assert.equal(authHandler.azureBotOAuthConnectionName, 'ConstructorConnection')
    assert.deepEqual(authHandler.oboScopes, []) // The real test comparison.
  })

  // Env variables as fallback
  it('should use legacy env variables when constructor options are not provided', () => {
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

  it('should use latest env variables when constructor options are not provided', () => {
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

    const app = new AgentApplication({ storage: new MemoryStorage() })

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

    const app = new AgentApplication({ storage: new MemoryStorage() })

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

    const app = new AgentApplication({ storage: new MemoryStorage() })

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

    const app = new AgentApplication({ storage: new MemoryStorage() })

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

    const app = new AgentApplication({ storage: new MemoryStorage() })

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
    assert.throws(() => {
      const app = new AgentApplication({
        storage: new MemoryStorage(),
        authorization: {
          testAuth: {}
        }
      })
      assert.equal(app, undefined)
    }, { message: '[handler:testAuth] The \'azureBotOAuthConnectionName\' option is not available in the app options. Ensure that the app is properly configured.' })
  })

  // AgenticUserAuthorization type tests
  it('should create AgenticAuthorization handler when type is AgenticUserAuthorization', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__type`]: 'AgenticUserAuthorization',
      [`${key}__scopes`]: 'scope1,scope2'
    }

    const app = new AgentApplication({ storage: new MemoryStorage() })

    const handler = (app.authorization as any).manager._handlers['testAuth']
    assert.equal(handler.constructor.name, 'AgenticAuthorization')
    assert.deepEqual(handler.options.scopes, ['scope1', 'scope2'])
  })

  it('should create AgenticAuthorization handler when type is agentic (deprecated)', () => {
    const key = 'AgentApplication__UserAuthorization__handlers__testAuth__settings'
    process.env = {
      ...process.env,
      [`${key}__type`]: 'agentic',
      [`${key}__scopes`]: 'scope1,scope2'
    }

    const app = new AgentApplication({ storage: new MemoryStorage() })

    const handler = (app.authorization as any).manager._handlers['testAuth']
    assert.equal(handler.constructor.name, 'AgenticAuthorization')
    assert.deepEqual(handler.options.scopes, ['scope1', 'scope2'])
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
      [`${key}__type`]: 'AgenticUserAuthorization',
      [`${key}__scopes`]: 'scope1',
      [`${key}__altBlueprintConnectionName`]: 'MyAltConnection'
    }

    const app = new AgentApplication({ storage: new MemoryStorage() })

    const handler = (app.authorization as any).manager._handlers['testAuth']
    assert.equal(handler.options.altBlueprintConnectionName, 'MyAltConnection')
  })

  it('should maintain handler properties casing', () => {
    const key = 'AGENTAPPLICATION__USERAUTHORIZATION__HANDLERS'
    process.env = {
      ...process.env,
      [`${key}__TESTAUTH__SETTINGS__AZUREBOTOAUTHCONNECTIONNAME`]: 'TestAuthLatestEnvConnection',
    }

    const app = new AgentApplication({ storage: new MemoryStorage() })

    const handler1 = (app.authorization as any).manager._handlers['TESTAUTH']
    assert.equal(handler1.options.azureBotOAuthConnectionName, 'TestAuthLatestEnvConnection')
  })

  it('should maintain handler id casing for latest env variables', () => {
    const key = 'AgentApplication__UserAuthorization__handlers'
    process.env = {
      ...process.env,
      [`${key}__testAuth__settings__azureBotOAuthConnectionName`]: 'TestAuthLatestEnvConnection',
      [`${key}__TESTUPPER_AUTH__settings__azureBotOAuthConnectionName`]: 'LatestEnvConnection',
    }

    const app = new AgentApplication({ storage: new MemoryStorage() })

    const handler1 = (app.authorization as any).manager._handlers['testAuth']
    const handler2 = (app.authorization as any).manager._handlers['TESTUPPER_AUTH']
    assert.notEqual(handler1, undefined)
    assert.notEqual(handler2, undefined)
  })

  it('should maintain handler id casing for legacy env variables', () => {
    process.env = {
      ...process.env,
      testAuth_connectionName: 'TestAuthLegacyEnvConnection',
      TESTUPPER_AUTH_connectionName: 'LegacyEnvConnection',
    }

    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {},
        TESTUPPER_AUTH: {}
      }
    })

    const handler1 = (app.authorization as any).manager._handlers['testAuth']
    const handler2 = (app.authorization as any).manager._handlers['TESTUPPER_AUTH']
    assert.notEqual(handler1, undefined)
    assert.notEqual(handler2, undefined)
  })

  it('should maintain handler id casing for constructor options', () => {
    const app = new AgentApplication({
      storage: new MemoryStorage(),
      authorization: {
        testAuth: {
          name: 'TestAuthConstructorConnection'
        },
        TESTUPPER_AUTH: {
          name: 'ConstructorConnection'
        }
      }
    })

    const handler1 = (app.authorization as any).manager._handlers['testAuth']
    const handler2 = (app.authorization as any).manager._handlers['TESTUPPER_AUTH']
    assert.notEqual(handler1, undefined)
    assert.notEqual(handler2, undefined)
  })
})

describe('AuthorizationManager - Processing', () => {
  let app: AgentApplication<any>
  let context: TurnContext
  let storage: MemoryStorage
  let mockConnections: Connections
  let testActivity: Activity
  let manager: AuthorizationManager
  let getHandlerIds: sinon.SinonStub

  const createTestActivity = () => Activity.fromObject({
    type: ActivityTypes.Message,
    from: { id: 'user-1' },
    recipient: { id: 'bot-1' },
    conversation: { id: 'conv-1' },
    channelId: 'webchat'
  })

  beforeEach(() => {
    storage = new MemoryStorage()
    testActivity = createTestActivity()
    mockConnections = {} as Connections

    app = new AgentApplication({
      storage,
      authorization: {
        handler1: { name: 'graph' },
        handler2: { type: 'agentic', scopes: ['scope2'] },
        handler3: { name: 'github' }
      }
    })

    const adapter = new TestAdapter()
    context = new TurnContext(adapter, testActivity)
    manager = new AuthorizationManager(app, mockConnections)
    getHandlerIds = sinon.stub().resolves(['handler1'])
  })

  it('should throw error if storage is not configured', () => {
    assert.throws(() => {
      // eslint-disable-next-line no-new
      new AgentApplication({
        authorization: {
          handler1: { type: 'agentic', scopes: ['scope1'] }
        }
      })
    }, /Storage is required for Authorization/)
  })

  it('should throw error for unsupported handler type', () => {
    assert.throws(() => {
      // eslint-disable-next-line no-new
      new AgentApplication({
        storage,
        authorization: {
          handler1: { type: 'unsupported', scopes: ['scope1'] } as any
        }
      })
    }, /Unsupported authorization handler type/)
  })

  it('should create handler instances successfully', () => {
    const manager = new AuthorizationManager(app, mockConnections)

    assert.notEqual(manager.handlers, undefined)
    assert.equal(manager.handlers.length, 3)
    assert.notEqual(manager.handlers.find(handler => handler.id === 'handler1'), undefined)
    assert.notEqual(manager.handlers.find(handler => handler.id === 'handler2'), undefined)
    assert.notEqual(manager.handlers.find(handler => handler.id === 'handler3'), undefined)
  })

  it('should return registered handlers', () => {
    const manager = new AuthorizationManager(app, mockConnections)

    const handlers = manager.handlers

    assert.equal(handlers.length, 3)
    assert.notEqual(handlers.find(handler => handler.id === 'handler1'), undefined)
    assert.notEqual(handlers.find(handler => handler.id === 'handler2'), undefined)
    assert.notEqual(handlers.find(handler => handler.id === 'handler3'), undefined)
  })

  it('should return authorized:true when conversation changes', async () => {
    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: { ...testActivity, conversation: { id: 'changed' } } as any, eTag: '*' })

    const result = await manager.process(context, getHandlerIds)

    const storageResult = await handlerStorage.read()
    assert.equal(result.authorized, true)
    assert.equal(storageResult, undefined)
  })

  it('should return authorized:true when handler returns APPROVED', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    const signinStub = sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
    assert.equal(signinStub.calledOnce, true)
  })

  it('should return authorized:true when handler returns IGNORED', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    const signinStub = sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.IGNORED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
    assert.equal(signinStub.calledOnce, true)
  })

  it('should return authorized:false when handler returns PENDING', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    const signinStub = sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.PENDING)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, false)
    assert.equal(signinStub.calledOnce, true)
  })

  it('should return authorized:false when handler returns REJECTED', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    const signinStub = sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.REJECTED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, false)
    assert.equal(signinStub.calledOnce, true)
  })

  it('should recursively call process when handler returns REVALIDATE', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    const signinStub = sinon.stub(handler, 'signin')
    signinStub.onFirstCall().resolves(AuthorizationHandlerStatus.REVALIDATE)
    signinStub.onSecondCall().resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
    assert.equal(signinStub.callCount, 2)
  })

  it('should throw error for unexpected status', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    sinon.stub(handler, 'signin').resolves('unexpected_status' as any)

    await assert.rejects(
      async () => await manager.process(context, getHandlerIds),
      /Unexpected registration status/
    )
  })

  it('should process multiple handlers in sequence', async () => {
    getHandlerIds.resolves(['handler1', 'handler2'])

    const handler1 = manager.handlers.find(handler => handler.id === 'handler1')!
    const handler2 = manager.handlers.find(handler => handler.id === 'handler2')!
    const signin1Stub = sinon.stub(handler1, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)
    const signin2Stub = sinon.stub(handler2, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
    assert.equal(signin1Stub.calledOnce, true)
    assert.equal(signin2Stub.calledOnce, true)
  })

  it('should stop processing on first PENDING', async () => {
    getHandlerIds.resolves(['handler1', 'handler2'])

    const handler1 = manager.handlers.find(handler => handler.id === 'handler1')!
    const handler2 = manager.handlers.find(handler => handler.id === 'handler2')!
    const signin1Stub = sinon.stub(handler1, 'signin').resolves(AuthorizationHandlerStatus.PENDING)
    const signin2Stub = sinon.stub(handler2, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, false)
    assert.equal(signin1Stub.calledOnce, true)
    assert.equal(signin2Stub.called, false)
  })

  it('should stop processing on first REJECTED', async () => {
    getHandlerIds.resolves(['handler1', 'handler2'])

    const handler1 = manager.handlers.find(handler => handler.id === 'handler1')!
    const handler2 = manager.handlers.find(handler => handler.id === 'handler2')!
    const signin1Stub = sinon.stub(handler1, 'signin').resolves(AuthorizationHandlerStatus.REJECTED)
    const signin2Stub = sinon.stub(handler2, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, false)
    assert.equal(signin1Stub.calledOnce, true)
    assert.equal(signin2Stub.called, false)
  })

  it('should continue processing on IGNORED', async () => {
    getHandlerIds.resolves(['handler1', 'handler2', 'handler3'])

    const handler1 = manager.handlers.find(handler => handler.id === 'handler1')!
    const handler2 = manager.handlers.find(handler => handler.id === 'handler2')!
    const handler3 = manager.handlers.find(handler => handler.id === 'handler3')!
    const signin1Stub = sinon.stub(handler1, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)
    const signin2Stub = sinon.stub(handler2, 'signin').resolves(AuthorizationHandlerStatus.IGNORED)
    const signin3Stub = sinon.stub(handler3, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
    assert.equal(signin1Stub.calledOnce, true)
    assert.equal(signin2Stub.calledOnce, true)
    assert.equal(signin3Stub.calledOnce, true)
  })

  it('should delete storage on APPROVED', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: testActivity, eTag: '*' })

    await manager.process(context, getHandlerIds)

    const storageResult = await handlerStorage.read()
    assert.equal(storageResult, undefined)
  })

  it('should delete storage on IGNORED', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.IGNORED)

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: testActivity, eTag: '*' })

    await manager.process(context, getHandlerIds)

    const storageResult = await handlerStorage.read()
    assert.equal(storageResult, undefined)
  })

  it('should delete storage on REJECTED', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.REJECTED)

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: testActivity, eTag: '*' })

    await manager.process(context, getHandlerIds)

    const storageResult = await handlerStorage.read()
    assert.equal(storageResult, undefined)
  })

  it('should not delete storage on PENDING', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.PENDING)

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: testActivity, eTag: '*' })

    await manager.process(context, getHandlerIds)

    const storageResult = await handlerStorage.read()
    assert.notEqual(storageResult, undefined)
  })

  it('should handle active handler session from storage', async () => {
    const originalActivity = createTestActivity()
    originalActivity.text = 'original message'

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: originalActivity, eTag: '*' })

    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    const signinStub = sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    await manager.process(context, getHandlerIds)

    // Verify the handler received the active handler data
    assert.equal(signinStub.calledOnce, true)
    const activeHandlerArg = signinStub.firstCall.args[1]
    assert.notEqual(activeHandlerArg, undefined)
    assert.equal(activeHandlerArg?.id, 'handler1')
  })

  it('should process active handler first when multiple handlers', async () => {
    getHandlerIds.resolves(['handler1', 'handler2'])

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler2', activity: testActivity, eTag: '*' })

    const handler1 = manager.handlers.find(handler => handler.id === 'handler1')!
    const handler2 = manager.handlers.find(handler => handler.id === 'handler2')!
    const signin1Stub = sinon.stub(handler1, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)
    const signin2Stub = sinon.stub(handler2, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    await manager.process(context, getHandlerIds)

    // handler2 should be called first because it's the active handler
    assert.equal(signin1Stub.calledOnce, true)
    assert.equal(signin2Stub.calledOnce, true)
    assert.ok(signin2Stub.calledBefore(signin1Stub))
  })

  it('should throw error when handler IDs are not found', async () => {
    getHandlerIds.resolves(['nonexistent'])

    await assert.rejects(
      async () => await manager.process(context, getHandlerIds),
      /Cannot find auth handlers with ID\(s\):/
    )
  })

  it('should throw error when signin fails', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    sinon.stub(handler, 'signin').rejects(new Error('Signin failed'))

    await assert.rejects(
      async () => await manager.process(context, getHandlerIds),
      /Failed to sign in/
    )
  })

  it('should delete storage when signin throws error', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    sinon.stub(handler, 'signin').rejects(new Error('Signin failed'))

    const handlerStorage = new HandlerStorage(storage, context)
    await handlerStorage.write({ id: 'handler1', activity: testActivity, eTag: '*' })

    try {
      await manager.process(context, getHandlerIds)
    } catch (error) {
      // Expected error
    }

    const storageResult = await handlerStorage.read()
    assert.equal(storageResult, undefined)
  })

  it('should handle getHandlerIds returning empty array', async () => {
    getHandlerIds.resolves([])

    const result = await manager.process(context, getHandlerIds)

    assert.equal(result.authorized, true)
  })

  it('should call getHandlerIds with current activity', async () => {
    const handler = manager.handlers.find(handler => handler.id === 'handler1')!
    sinon.stub(handler, 'signin').resolves(AuthorizationHandlerStatus.APPROVED)

    await manager.process(context, getHandlerIds)

    assert.equal(getHandlerIds.calledOnce, true)
    assert.deepEqual(getHandlerIds.firstCall.args[0], testActivity)
  })
})
