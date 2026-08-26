/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { inspect } from 'node:util'
import {
  createConfigurationContext,
  getConfigurationSnapshot,
  preloadConfigurationSources,
  resetConfigurationSourcesForTest,
  suggestConfigurationPath
} from '../../src/configuration/configuration'
import { getAuthConfigWithDefaults } from '../../src/auth/authConfiguration'
import { Errors } from '../../src/errorHelper'
import { createOutboundHostValidator, OutboundHostValidator } from '../../src/outboundHostValidator'

interface ConfigurationTestError extends Error {
  code?: number
  description?: string
  innerException?: Error & { code?: number }
}

describe('configuration sources', () => {
  beforeEach(() => {
    resetConfigurationSourcesForTest()
  })

  afterEach(() => {
    resetConfigurationSourcesForTest()
  })

  it('creates independent immutable host-scoped contexts', async () => {
    const enabled = await createConfigurationContext([{
      source: {
        name: 'enabled',
        async load () {
          return {
            format: 'document',
            value: {
              cloudAdapterOptions: {
                emitStackTrace: true
              }
            }
          } as const
        }
      },
      mode: 'overrideEnvironment'
    }])
    const disabled = await createConfigurationContext([{
      source: {
        name: 'disabled',
        async load () {
          return {
            format: 'document',
            value: {
              cloudAdapterOptions: {
                emitStackTrace: false
              }
            }
          } as const
        }
      },
      mode: 'overrideEnvironment'
    }])

    assert.equal(getConfigurationSnapshot(enabled).overrideEnvironment.cloudAdapterOptions.emitStackTrace, true)
    assert.equal(getConfigurationSnapshot(disabled).overrideEnvironment.cloudAdapterOptions.emitStackTrace, false)
    assert.equal(getConfigurationSnapshot().overrideEnvironment.cloudAdapterOptions.emitStackTrace, undefined)
  })

  it('loads sources by explicit mode and registration order', async () => {
    await preloadConfigurationSources([
      {
        source: {
          name: 'first',
          async load () {
            return {
              format: 'canonical',
              values: {
                'cloudAdapterOptions.emitStackTrace': 'false'
              }
            }
          }
        },
        mode: 'overrideEnvironment'
      },
      {
        source: {
          name: 'second',
          async load () {
            return {
              format: 'canonical',
              values: {
                'cloudAdapterOptions.emitStackTrace': 'true'
              }
            }
          }
        },
        mode: 'overrideEnvironment'
      }
    ])

    const result = getConfigurationSnapshot()
    assert.equal(result.overrideEnvironment.cloudAdapterOptions.emitStackTrace, true)
  })

  it('loads the legacy bare canonical source result', async () => {
    const context = await createConfigurationContext([{
      source: {
        name: 'legacy-canonical',
        async load () {
          return {
            'cloudAdapterOptions.emitStackTrace': 'true'
          }
        }
      },
      mode: 'overrideEnvironment'
    }])

    assert.equal(getConfigurationSnapshot(context).overrideEnvironment.cloudAdapterOptions.emitStackTrace, true)
  })

  it('preserves registration order within the same mode', async () => {
    await preloadConfigurationSources([
      {
        source: {
          name: 'first',
          async load () {
            return {
              format: 'canonical',
              values: {
                'cloudAdapterOptions.emitStackTrace': 'false'
              }
            }
          }
        },
        mode: 'fallback'
      },
      {
        source: {
          name: 'second',
          async load () {
            return {
              format: 'canonical',
              values: {
                'cloudAdapterOptions.emitStackTrace': 'true'
              }
            }
          }
        },
        mode: 'fallback'
      }
    ])

    const result = getConfigurationSnapshot()
    assert.equal(result.fallback.cloudAdapterOptions.emitStackTrace, true)
  })

  it('stores typed patches under the configured modes', async () => {
    await preloadConfigurationSources([
      {
        source: {
          name: 'fallback-source',
          async load () {
            return {
              format: 'canonical',
              values: {
                'cloudAdapterOptions.emitStackTrace': 'false'
              }
            }
          }
        },
        mode: 'fallback'
      },
      {
        source: {
          name: 'override-env-source',
          async load () {
            return {
              format: 'canonical',
              values: {
                'cloudAdapterOptions.validateServiceUrl': 'true'
              }
            }
          }
        },
        mode: 'overrideEnvironment'
      },
      {
        source: {
          name: 'enforce-source',
          async load () {
            return {
              format: 'canonical',
              values: {
                'cloudAdapterOptions.emitStackTrace': 'true'
              }
            }
          }
        },
        mode: 'enforce'
      }
    ])

    const result = getConfigurationSnapshot()
    assert.equal(result.fallback.cloudAdapterOptions.emitStackTrace, false)
    assert.equal(result.overrideEnvironment.cloudAdapterOptions.validateServiceUrl, true)
    assert.equal(result.enforce.cloudAdapterOptions.emitStackTrace, true)
  })

  it('rejects a configuration source with an empty name', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: '   ',
          async load () {
            return { format: 'canonical', values: {} }
          }
        },
        mode: 'fallback'
      }]),
      /non-empty/
    )

    await preloadConfigurationSources([])
    assert.deepEqual(getConfigurationSnapshot().fallback.cloudAdapterOptions, {})
  })

  it('rejects duplicate source names', async () => {
    const source = {
      name: 'duplicate',
      async load () {
        return { format: 'canonical', values: {} }
      }
    }

    await assert.rejects(
      preloadConfigurationSources([
        { source, mode: 'fallback' },
        { source, mode: 'enforce' }
      ]),
      /registered more than once/
    )
  })

  it('rejects unsupported source modes before loading with remediation', async () => {
    let loaded = false
    await assert.rejects(
      createConfigurationContext([{
        source: {
          name: 'invalid-mode-source',
          async load () {
            loaded = true
            return { format: 'canonical', values: {} }
          }
        },
        mode: 'highest' as unknown as 'fallback'
      }]),
      (error: Error & { code?: number }) => {
        assert.equal(error.code, Errors.InvalidConfigurationSourceMode.code)
        assert.match(error.message, /invalid-mode-source/)
        assert.match(error.message, /highest/)
        assert.match(error.message, /fallback.*overrideEnvironment.*enforce/)
        return true
      }
    )
    assert.equal(loaded, false)
  })

  it('rejects unsupported canonical paths without committing a snapshot', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'invalid',
          async load () {
            return { format: 'canonical', values: { 'unknown.path': 'value' } }
          }
        },
        mode: 'enforce'
      }]),
      /unsupported canonical path/
    )

    assert.deepEqual(getConfigurationSnapshot().enforce.cloudAdapterOptions, {})
  })

  it('rejects the unpublished pre-schema canonical path vocabulary', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'old-canonical-root',
          async load () {
            return {
              format: 'canonical',
              values: {
                'hosting.cloudAdapter.emitStackTrace': 'true'
              }
            }
          }
        },
        mode: 'fallback'
      }]),
      /unsupported canonical path/
    )
  })

  it('rejects unknown properties in a supported path family', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'invalid-property',
          async load () {
            return { format: 'canonical', values: { 'cloudAdapterOptions.emitStakTrace': 'true' } }
          }
        },
        mode: 'enforce'
      }]),
      (error: Error) => {
        assert.match(error.message, /unsupported canonical path/)
        assert.match(error.message, /Did you mean `cloudAdapterOptions\.emitStackTrace`\?/)
        return true
      }
    )
  })

  it('rejects case-equivalent canonical destinations', async () => {
    await assert.rejects(
      createConfigurationContext([{
        source: {
          name: 'duplicate-canonical-case',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connections.Primary.settings.clientId': 'first',
                'connections.primary.settings.CLIENTID': 'second'
              }
            } as const
          }
        },
        mode: 'enforce'
      }]),
      (error: Error & { code?: number }) => {
        assert.equal(error.code, Errors.InvalidConfigurationPath.code)
        assert.match(error.message, /duplicate canonical destination/i)
        assert.match(error.message, /connections\.primary\.settings\.CLIENTID/)
        return true
      }
    )
  })

  it('rejects numerically equivalent canonical route indexes', async () => {
    await assert.rejects(
      createConfigurationContext([{
        source: {
          name: 'duplicate-canonical-index',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connectionsMap.01.serviceUrl': '*',
                'connectionsMap.1.serviceUrl': 'https://duplicate.example'
              }
            } as const
          }
        },
        mode: 'enforce'
      }]),
      (error: Error & { code?: number }) => {
        assert.equal(error.code, Errors.InvalidConfigurationPath.code)
        assert.match(error.message, /duplicate canonical destination/i)
        assert.match(error.message, /connectionsMap\.1\.serviceUrl/)
        return true
      }
    )
  })

  it('suggests fixed canonical segments while preserving dynamic IDs and indexes', () => {
    assert.equal(
      suggestConfigurationPath('clodAdapterOptions.emitStackTrace'),
      'cloudAdapterOptions.emitStackTrace'
    )
    assert.equal(
      suggestConfigurationPath('connections.Agent.Primary.setings.clietnId'),
      'connections.Agent.Primary.settings.clientId'
    )
    assert.equal(
      suggestConfigurationPath('connectionsMap.7.servceUrl'),
      'connectionsMap.7.serviceUrl'
    )
    assert.equal(
      suggestConfigurationPath('outboundHostValidator.enabeld'),
      'outboundHostValidator.enabled'
    )
    assert.equal(
      suggestConfigurationPath('agentApplication.userAuthoriztion.handlres.Graph.Handler.setings.scops'),
      'agentApplication.userAuthorization.handlers.Graph.Handler.settings.scopes'
    )
    assert.equal(
      suggestConfigurationPath('CloudAdaptrOptions'),
      'cloudAdapterOptions'
    )
    assert.equal(
      suggestConfigurationPath('AgentApplication.UserAuthoriztion'),
      'agentApplication.userAuthorization'
    )
    assert.equal(suggestConfigurationPath('unrelated.host.setting'), undefined)
  })

  it('adds canonical suggestions to hierarchical document errors', async () => {
    const cases = [
      {
        value: { CloudAdaptrOptions: { EmitStackTrace: true } },
        path: /CloudAdaptrOptions/,
        suggestion: /Did you mean `cloudAdapterOptions`\?/
      },
      {
        value: { AgentApplication: { UserAuthoriztion: {} } },
        path: /AgentApplication\.UserAuthoriztion/,
        suggestion: /Did you mean `agentApplication\.userAuthorization`\?/
      },
      {
        value: { AgentApplication: { UserAuthorization: { Handlres: {} } } },
        path: /AgentApplication\.UserAuthorization\.Handlres/,
        suggestion: /Did you mean `agentApplication\.userAuthorization\.handlers`\?/
      },
      {
        value: { Connections: { Primary: { Setings: {} } } },
        path: /Connections\.Primary\.Setings/,
        suggestion: /Did you mean `connections\.Primary\.settings`\?/
      },
      {
        value: { CloudAdapterOptions: { EmitStakTrace: true } },
        path: /cloudAdapterOptions\.EmitStakTrace/,
        suggestion: /Did you mean `cloudAdapterOptions\.emitStackTrace`\?/
      }
    ] as const

    for (const testCase of cases) {
      await assert.rejects(
        createConfigurationContext([{
          source: {
            name: 'document-typo',
            async load () {
              return {
                format: 'document',
                value: testCase.value
              } as const
            }
          },
          mode: 'enforce'
        }]),
        (error: Error) => {
          assert.match(error.message, testCase.path)
          assert.match(error.message, testCase.suggestion)
          return true
        }
      )
    }
  })

  it('rejects invalid typed values without exposing the raw value', async () => {
    const secretValue = 'not-a-boolean-secret'
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'invalid-value',
          async load () {
            return { format: 'canonical', values: { 'cloudAdapterOptions.validateServiceUrl': secretValue } }
          }
        },
        mode: 'enforce'
      }]),
      (error: Error) => {
        assert.match(error.message, /invalid value/)
        assert.match(error.message, /cloudAdapterOptions\.validateServiceUrl/)
        assert.doesNotMatch(error.message, new RegExp(secretValue))
        return true
      }
    )
  })

  it('rejects legacy aliases in canonical external paths', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'legacy-alias',
          async load () {
            return { format: 'canonical', values: { 'connections.serviceConnection.settings.FICClientId': 'value' } }
          }
        },
        mode: 'fallback'
      }]),
      /unsupported canonical path/
    )
  })

  it('rejects prototype-chain connection IDs without polluting global objects', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'prototype-connection',
          async load () {
            return { format: 'canonical', values: { 'connections.__proto__.settings.clientId': 'polluted' } }
          }
        },
        mode: 'fallback'
      }]),
      /unsupported canonical path/
    )

    const cleanObject: { clientId?: string } = {}
    assert.equal(cleanObject.clientId, undefined)
  })

  it('rejects prototype-chain authorization handler IDs', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'prototype-handler',
          async load () {
            return { format: 'canonical', values: { 'agentApplication.userAuthorization.handlers.constructor.settings.type': 'AzureBotUserAuthorization' } }
          }
        },
        mode: 'fallback'
      }]),
      /unsupported canonical path/
    )
  })

  it('leaves preload available for a later valid source when a source fails', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'failure',
          async load () {
            throw new Error('secret value must not be surfaced')
          }
        },
        mode: 'enforce'
      }]),
      (error: Error) => {
        assert.match(error.message, /failed to load/)
        assert.doesNotMatch(error.message, /secret value/)
        return true
      }
    )

    await preloadConfigurationSources([{
      source: {
        name: 'valid',
        async load () {
          return { format: 'canonical', values: { 'cloudAdapterOptions.emitStackTrace': 'true' } }
        }
      },
      mode: 'enforce'
    }])

    assert.equal(getConfigurationSnapshot().enforce.cloudAdapterOptions.emitStackTrace, true)
  })

  it('defers canonical destination validation to preload for sources that load successfully', async () => {
    const source = {
      name: 'deferred-destination',
      async load () {
        return { format: 'canonical', values: { 'not.a.supported.canonical.path': 'configured-client-id' } }
      }
    }

    assert.deepEqual(await source.load(), {
      format: 'canonical',
      values: {
        'not.a.supported.canonical.path': 'configured-client-id'
      }
    })
    await assert.rejects(
      preloadConfigurationSources([{
        source,
        mode: 'overrideEnvironment'
      }]),
      /unsupported canonical path/
    )
  })

  it('does not retain secret-bearing details from a failing source error', async () => {
    const leakedValue = 'preload-only-secret'
    const innerError = new Error(`upstream failure: ${leakedValue}`) as ConfigurationTestError
    innerError.code = -200006

    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'vault-source',
          async load () {
            throw innerError
          }
        },
        mode: 'overrideEnvironment'
      }]),
      (error: ConfigurationTestError) => {
        assert.match(error.message, /vault-source/)
        assert.match(error.message, /failed to load/)
        assert.equal(error.message.includes(leakedValue), false)
        assert.equal(error.innerException, undefined)
        assert.equal(inspect(error).includes(leakedValue), false)
        assert.equal(JSON.stringify(error).includes(leakedValue), false)
        return true
      }
    )
  })

  it('normalizes a hierarchical document into the shared typed snapshot', async () => {
    await preloadConfigurationSources([{
      source: {
        name: 'hierarchical',
        async load () {
          return {
            format: 'document',
            value: {
              Connections: {
                Primary: {
                  Settings: {
                    ClientId: 'primary-client',
                    Scopes: ['scope-a', 'scope-b'],
                    SendX5C: true
                  }
                }
              },
              ConnectionsMap: [{
                ServiceUrl: '*',
                Connection: 'Primary'
              }],
              CloudAdapterOptions: {
                EmitStackTrace: true
              },
              OutboundHostValidator: {
                Enabled: true,
                IncludeDefaultMicrosoftHosts: false,
                Hosts: ['api.contoso.com']
              },
              AgentApplication: {
                UserAuthorization: {
                  Handlers: {
                    Graph: {
                      Settings: {
                        Type: 'AgenticUserAuthorization',
                        Scopes: ['scope-a']
                      }
                    }
                  }
                }
              }
            }
          } as const
        }
      },
      mode: 'overrideEnvironment'
    }])

    const snapshot = getConfigurationSnapshot().overrideEnvironment
    assert.deepEqual(snapshot.connections.get('primary'), {
      id: 'Primary',
      settings: {
        clientId: 'primary-client',
        scopes: ['scope-a', 'scope-b'],
        sendX5C: true
      }
    })
    assert.deepEqual(snapshot.connectionsMap.get(0), {
      serviceUrl: '*',
      connection: 'Primary'
    })
    assert.deepEqual(snapshot.cloudAdapterOptions, { emitStackTrace: true })
    assert.deepEqual(snapshot.outboundHostValidator, {
      enabled: true,
      includeDefaultMicrosoftHosts: false,
      hosts: ['api.contoso.com']
    })
    assert.deepEqual(snapshot.agentApplication.userAuthorization.handlers.get('graph'), {
      id: 'Graph',
      settings: {
        type: 'AgenticUserAuthorization',
        scopes: ['scope-a']
      }
    })
  })

  it('compiles equivalent canonical and document inputs into identical shapes and consumer behavior', async () => {
    const canonical = await createConfigurationContext([{
      source: {
        name: 'canonical',
        async load () {
          return {
            format: 'canonical',
            values: {
              'connections.Agent.Primary.settings.clientId': 'primary-client',
              'connections.Agent.Primary.settings.scopes': 'scope-a scope-b',
              'connections.Agent.Primary.settings.sendX5C': 'true',
              'connectionsMap.0.serviceUrl': '*',
              'connectionsMap.0.connection': 'Agent.Primary',
              'cloudAdapterOptions.emitStackTrace': 'true',
              'outboundHostValidator.enabled': 'true',
              'outboundHostValidator.includeDefaultMicrosoftHosts': 'false',
              'outboundHostValidator.hosts': 'api.contoso.com api.fabrikam.com',
              'agentApplication.userAuthorization.handlers.Graph.Handler.settings.type': 'AgenticUserAuthorization',
              'agentApplication.userAuthorization.handlers.Graph.Handler.settings.scopes': 'scope-a scope-b'
            }
          } as const
        }
      },
      mode: 'enforce'
    }])
    const document = await createConfigurationContext([{
      source: {
        name: 'document',
        async load () {
          return {
            format: 'document',
            value: {
              connections: {
                'Agent.Primary': {
                  settings: {
                    clientId: 'primary-client',
                    scopes: ['scope-a', 'scope-b'],
                    sendX5C: true
                  }
                }
              },
              connectionsMap: [{
                serviceUrl: '*',
                connection: 'Agent.Primary'
              }],
              cloudAdapterOptions: {
                emitStackTrace: true
              },
              outboundHostValidator: {
                enabled: true,
                includeDefaultMicrosoftHosts: false,
                hosts: ['api.contoso.com', 'api.fabrikam.com']
              },
              agentApplication: {
                userAuthorization: {
                  handlers: {
                    'Graph.Handler': {
                      settings: {
                        type: 'AgenticUserAuthorization',
                        scopes: ['scope-a', 'scope-b']
                      }
                    }
                  }
                }
              }
            }
          } as const
        }
      },
      mode: 'enforce'
    }])

    assert.deepEqual(
      getConfigurationSnapshot(canonical).enforce,
      getConfigurationSnapshot(document).enforce
    )

    const canonicalAuth = getAuthConfigWithDefaults(undefined, { configurationContext: canonical })
    const documentAuth = getAuthConfigWithDefaults(undefined, { configurationContext: document })
    assert.deepEqual(
      canonicalAuth.connections?.get('Agent.Primary'),
      documentAuth.connections?.get('Agent.Primary')
    )
    assert.deepEqual(canonicalAuth.connectionsMap, documentAuth.connectionsMap)

    const canonicalHosts = createOutboundHostValidator({ configurationContext: canonical })
    const documentHosts = createOutboundHostValidator({ configurationContext: document })
    const canonicalDirectHosts = new OutboundHostValidator({ configurationContext: canonical })
    const documentDirectHosts = new OutboundHostValidator({ configurationContext: document })
    for (const url of ['https://api.contoso.com/path', 'https://api.fabrikam.com/path', 'https://example.com/path']) {
      assert.equal(canonicalHosts.isAllowed(url), documentHosts.isAllowed(url))
      assert.equal(canonicalDirectHosts.isAllowed(url), documentDirectHosts.isAllowed(url))
      assert.equal(canonicalDirectHosts.isAllowed(url), canonicalHosts.isAllowed(url))
    }
  })

  it('rejects duplicate hierarchical keys after case normalization', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'duplicate-document-key',
          async load () {
            return {
              format: 'document',
              value: {
                cloudAdapterOptions: { emitStackTrace: true },
                CloudAdapterOptions: { emitStackTrace: false }
              }
            } as const
          }
        },
        mode: 'fallback'
      }]),
      /unsupported canonical path/
    )
  })

  it('normalizes shared aliases and preserves provider extension settings', async () => {
    await preloadConfigurationSources([{
      source: {
        name: 'provider-settings',
        async load () {
          return {
            format: 'document',
            value: {
              connections: {
                primary: {
                  settings: {
                    alternateBlueprintConnectionName: 'blueprint',
                    customBoolean: true,
                    customScopes: ['scope-a']
                  }
                }
              },
              agentApplication: {
                userAuthorization: {
                  handlers: {
                    custom: {
                      settings: {
                        alternateBlueprintConnectionName: 'handler-blueprint',
                        customInteger: 2
                      }
                    }
                  }
                }
              }
            }
          } as const
        }
      },
      mode: 'fallback'
    }])

    const snapshot = getConfigurationSnapshot().fallback
    assert.deepEqual(snapshot.connections.get('primary'), {
      id: 'primary',
      settings: {
        altBlueprintConnectionName: 'blueprint',
        customBoolean: true,
        customScopes: ['scope-a']
      }
    })
    assert.deepEqual(snapshot.agentApplication.userAuthorization.handlers.get('custom')?.settings, {
      altBlueprintConnectionName: 'handler-blueprint',
      customInteger: 2
    })
  })

  it('preserves dotted connection and authorization handler IDs', async () => {
    await preloadConfigurationSources([{
      source: {
        name: 'dotted-identifiers',
        async load () {
          return {
            format: 'document',
            value: {
              connections: {
                'graph.v2': {
                  settings: {
                    clientId: 'graph-client'
                  }
                }
              },
              agentApplication: {
                userAuthorization: {
                  handlers: {
                    'graph.auth': {
                      settings: {
                        azureBotOAuthConnectionName: 'graph-connection'
                      }
                    }
                  }
                }
              }
            }
          } as const
        }
      },
      mode: 'fallback'
    }])

    const snapshot = getConfigurationSnapshot().fallback
    assert.equal(snapshot.connections.get('graph.v2')?.settings.clientId, 'graph-client')
    assert.equal(
      snapshot.agentApplication.userAuthorization.handlers.get('graph.auth')?.settings.azureBotOAuthConnectionName,
      'graph-connection'
    )
  })

  it('preserves dotted IDs in schema-aligned canonical paths', async () => {
    await preloadConfigurationSources([{
      source: {
        name: 'canonical-dotted-identifiers',
        async load () {
          return {
            format: 'canonical',
            values: {
              'connections.graph.v2.settings.clientId': 'graph-client',
              'agentApplication.userAuthorization.handlers.graph.auth.settings.type': 'AgenticUserAuthorization'
            }
          }
        }
      },
      mode: 'fallback'
    }])

    const snapshot = getConfigurationSnapshot().fallback
    assert.equal(snapshot.connections.get('graph.v2')?.settings.clientId, 'graph-client')
    assert.equal(
      snapshot.agentApplication.userAuthorization.handlers.get('graph.auth')?.settings.type,
      'AgenticUserAuthorization'
    )
  })

  it('rejects conflicting canonical and shared alias names', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'conflicting-aliases',
          async load () {
            return {
              format: 'document',
              value: {
                connections: {
                  primary: {
                    settings: {
                      altBlueprintConnectionName: 'first',
                      alternateBlueprintConnectionName: 'second'
                    }
                  }
                }
              }
            } as const
          }
        },
        mode: 'fallback'
      }]),
      /unsupported canonical path/
    )
  })

  it('rejects .NET-only implementation metadata in the JavaScript runtime', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'dotnet-metadata',
          async load () {
            return {
              format: 'document',
              value: {
                connections: {
                  primary: {
                    assembly: 'Microsoft.Agents.Authentication.Msal',
                    settings: { clientId: 'primary-client' }
                  }
                }
              }
            } as const
          }
        },
        mode: 'fallback'
      }]),
      /not supported by the JavaScript SDK/
    )
  })

  it('rejects .NET-only provider settings in the JavaScript runtime', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'dotnet-settings',
          async load () {
            return {
              format: 'document',
              value: {
                connections: {
                  primary: {
                    settings: {
                      certificateThumbPrint: 'thumbprint'
                    }
                  }
                }
              }
            } as const
          }
        },
        mode: 'fallback'
      }]),
      /not supported by the JavaScript SDK/
    )
  })

  it('accepts the positive-integer JavaScript milliseconds form of requestTimeout in a document', async () => {
    await preloadConfigurationSources([{
      source: {
        name: 'request-timeout-integer',
        async load () {
          return {
            format: 'document',
            value: {
              connections: {
                primary: {
                  settings: {
                    clientId: 'primary-client',
                    requestTimeout: 5000
                  }
                }
              }
            }
          } as const
        }
      },
      mode: 'fallback'
    }])

    assert.equal(getConfigurationSnapshot().fallback.connections.get('primary')?.settings.requestTimeout, 5000)
  })

  it('continues to accept a canonical numeric string requestTimeout (existing JavaScript behavior)', async () => {
    await preloadConfigurationSources([{
      source: {
        name: 'request-timeout-canonical',
        async load () {
          return {
            format: 'canonical',
            values: {
              'connections.primary.settings.requestTimeout': '5000'
            }
          }
        }
      },
      mode: 'fallback'
    }])

    assert.equal(getConfigurationSnapshot().fallback.connections.get('primary')?.settings.requestTimeout, 5000)
  })

  it('rejects a .NET-only string TimeSpan requestTimeout in a document as an unsupported runtime field', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'request-timeout-timespan',
          async load () {
            return {
              format: 'document',
              value: {
                connections: {
                  primary: {
                    settings: {
                      clientId: 'primary-client',
                      requestTimeout: '00:00:30'
                    }
                  }
                }
              }
            } as const
          }
        },
        mode: 'fallback'
      }]),
      (error: ConfigurationTestError) => {
        assert.match(error.message, /not supported by the JavaScript SDK/)
        assert.match(error.message, /requestTimeout/)
        assert.equal(error.code, -120913)
        return true
      }
    )
  })

  it('rejects .NET-only handler-definition type metadata in the JavaScript runtime', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'dotnet-handler-type',
          async load () {
            return {
              format: 'document',
              value: {
                agentApplication: {
                  userAuthorization: {
                    handlers: {
                      graph: {
                        type: 'AzureBotUserAuthorization',
                        settings: { azureBotOAuthConnectionName: 'graph' }
                      }
                    }
                  }
                }
              }
            } as const
          }
        },
        mode: 'fallback'
      }]),
      /not supported by the JavaScript SDK/
    )
  })

  it('rejects .NET-only handler-definition assembly metadata in the JavaScript runtime', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'dotnet-handler-assembly',
          async load () {
            return {
              format: 'document',
              value: {
                agentApplication: {
                  userAuthorization: {
                    handlers: {
                      graph: {
                        assembly: 'Microsoft.Agents.Authorization',
                        settings: { azureBotOAuthConnectionName: 'graph' }
                      }
                    }
                  }
                }
              }
            } as const
          }
        },
        mode: 'fallback'
      }]),
      /not supported by the JavaScript SDK/
    )
  })

  it('accepts the JavaScript handler discriminator at handlers.<id>.settings.type', async () => {
    await preloadConfigurationSources([{
      source: {
        name: 'handler-settings-type',
        async load () {
          return {
            format: 'document',
            value: {
              agentApplication: {
                userAuthorization: {
                  handlers: {
                    graph: {
                      settings: { type: 'AzureBotUserAuthorization' }
                    }
                  }
                }
              }
            }
          } as const
        }
      },
      mode: 'fallback'
    }])

    assert.equal(
      getConfigurationSnapshot().fallback.agentApplication.userAuthorization.handlers.get('graph')?.settings.type,
      'AzureBotUserAuthorization'
    )
  })

  it('rejects .NET-only userAuthorization.defaultHandlerName in the JavaScript runtime', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'dotnet-default-handler',
          async load () {
            return {
              format: 'document',
              value: {
                agentApplication: {
                  userAuthorization: {
                    defaultHandlerName: 'graph',
                    handlers: {
                      graph: { settings: { azureBotOAuthConnectionName: 'graph' } }
                    }
                  }
                }
              }
            } as const
          }
        },
        mode: 'fallback'
      }]),
      /not supported by the JavaScript SDK/
    )
  })

  it('rejects .NET-only userAuthorization.autoSignIn in the JavaScript runtime', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'dotnet-auto-sign-in',
          async load () {
            return {
              format: 'document',
              value: {
                agentApplication: {
                  userAuthorization: {
                    autoSignIn: true,
                    handlers: {
                      graph: { settings: { azureBotOAuthConnectionName: 'graph' } }
                    }
                  }
                }
              }
            } as const
          }
        },
        mode: 'fallback'
      }]),
      /not supported by the JavaScript SDK/
    )
  })

  it('rejects an undiscriminated source result', async () => {
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'undiscriminated',
          async load () {
            return { values: {} } as never
          }
        },
        mode: 'fallback'
      }]),
      /invalid source result/
    )
  })

  it('rejects a second successful preload before consumption', async () => {
    await preloadConfigurationSources([])

    await assert.rejects(
      preloadConfigurationSources([]),
      /already been preloaded/
    )
  })

  it('rejects preload after configuration has been consumed', async () => {
    getConfigurationSnapshot()

    await assert.rejects(
      preloadConfigurationSources([]),
      /before the first configuration consumer/
    )
  })

  it('blocks consumption while preload is in progress and commits when it completes', async () => {
    let completeLoad: ((values: {
      format: 'canonical'
      values: Readonly<Record<string, string>>
    }) => void) | undefined
    const loading = preloadConfigurationSources([{
      source: {
        name: 'slow-source',
        load () {
          return new Promise(resolve => {
            completeLoad = resolve
          })
        }
      },
      mode: 'enforce'
    }])

    assert.throws(
      () => getConfigurationSnapshot(),
      /preload is already in progress/
    )
    completeLoad?.({
      format: 'canonical',
      values: { 'cloudAdapterOptions.emitStackTrace': 'true' }
    })

    await loading
    assert.equal(getConfigurationSnapshot().enforce.cloudAdapterOptions.emitStackTrace, true)
  })

  it('rejects a concurrent preload while preserving the first load', async () => {
    let completeLoad: ((values: {
      format: 'canonical'
      values: Readonly<Record<string, string>>
    }) => void) | undefined
    const loading = preloadConfigurationSources([{
      source: {
        name: 'slow-source',
        load () {
          return new Promise(resolve => {
            completeLoad = resolve
          })
        }
      },
      mode: 'enforce'
    }])

    await assert.rejects(
      preloadConfigurationSources([]),
      /preload is already in progress/
    )

    completeLoad?.({
      format: 'canonical',
      values: { 'cloudAdapterOptions.emitStackTrace': 'true' }
    })
    await loading
    assert.equal(getConfigurationSnapshot().enforce.cloudAdapterOptions.emitStackTrace, true)
  })
})
