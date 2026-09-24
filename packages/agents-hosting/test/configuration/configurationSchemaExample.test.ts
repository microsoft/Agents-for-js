/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  getConfigurationSnapshot,
  preloadConfigurationSources,
  resetConfigurationSourcesForTest
} from '../../src/configuration/configuration'
import { ConfigurationDocument } from '../../src/configuration/configurationSource'
import { loadAuthConfigFromEnv } from '../../src/auth/authConfiguration'
import { AgentApplication } from '../../src/app/agentApplication'
import { MemoryStorage } from '../../src/storage/memoryStorage'

// This test keeps docs/schemas/agents-configuration.schema.json honest about
// what the JavaScript configuration compiler actually accepts: the schema
// example must compile cleanly, and fields the compiler rejects as .NET-only
// must be annotated (and absent from the shared example) so the schema does
// not silently drift from JS runtime behavior.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const schemaPath = join(repoRoot, 'docs', 'schemas', 'agents-configuration.schema.json')

interface SchemaProperty {
  readonly ['x-agents-runtimes']?: readonly string[]
  readonly type?: string
  readonly minLength?: number
  readonly exclusiveMinimum?: number
  readonly oneOf?: readonly SchemaProperty[]
}

interface AgentsConfigurationSchema {
  readonly examples: readonly [ConfigurationDocument]
  readonly $defs: {
    readonly userAuthorization: { readonly properties: Record<string, SchemaProperty> }
    readonly authorizationHandlerDefinition: { readonly properties: Record<string, SchemaProperty> }
    readonly authorizationHandlerSettings: { readonly properties: Record<string, SchemaProperty> }
    readonly connectionSettings: { readonly properties: Record<string, SchemaProperty> }
    readonly connectionMapItem: { readonly properties: Record<string, SchemaProperty> }
    readonly cloudAdapterOptions: { readonly properties: Record<string, SchemaProperty> }
    readonly outboundHostValidator: { readonly properties: Record<string, SchemaProperty> }
  }
}

function loadSchema (): AgentsConfigurationSchema {
  const raw = readFileSync(schemaPath, 'utf8')
  const schema: AgentsConfigurationSchema = JSON.parse(raw)
  return schema
}

describe('agents-configuration.schema.json / JavaScript consistency', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = process.env
    resetConfigurationSourcesForTest()
  })

  afterEach(() => {
    process.env = originalEnv
    resetConfigurationSourcesForTest()
  })

  it('marks userAuthorization.defaultHandlerName and autoSignIn as .NET-only', () => {
    const schema = loadSchema()
    const { defaultHandlerName, autoSignIn } = schema.$defs.userAuthorization.properties
    assert.deepEqual(defaultHandlerName['x-agents-runtimes'], ['dotnet'])
    assert.deepEqual(autoSignIn['x-agents-runtimes'], ['dotnet'])
  })

  it('places each runtime handler type discriminator at the supported level', () => {
    const schema = loadSchema()
    const handlerType = schema.$defs.authorizationHandlerDefinition.properties.type
    const handlerSettingsType = schema.$defs.authorizationHandlerSettings.properties.type
    assert.deepEqual(handlerType['x-agents-runtimes'], ['dotnet'])
    assert.deepEqual(handlerSettingsType['x-agents-runtimes'], ['javascript'])
  })

  it('annotates connectionSettings.requestTimeout as a resolved JS/.NET superset field', () => {
    const schema = loadSchema()
    const requestTimeout = schema.$defs.connectionSettings.properties.requestTimeout
    const branches = requestTimeout.oneOf ?? []
    assert.equal(branches.length, 2)

    const integerBranch = branches.find(branch => branch.type === 'integer')
    const stringBranch = branches.find(branch => branch.type === 'string')
    assert.ok(integerBranch, 'expected an integer requestTimeout branch')
    assert.ok(stringBranch, 'expected a string requestTimeout branch')
    assert.deepEqual(integerBranch?.['x-agents-runtimes'], ['javascript'])
    assert.equal(integerBranch?.exclusiveMinimum, 0)
    assert.deepEqual(stringBranch?.['x-agents-runtimes'], ['dotnet'])
  })

  it('declares every current JavaScript canonical configuration leaf', () => {
    const schema = loadSchema()
    const expected = {
      connectionSettings: [
        'authType',
        'tenantId',
        'clientId',
        'clientSecret',
        'certPemFile',
        'certKeyFile',
        'connectionName',
        'federatedClientId',
        'authorityEndpoint',
        'scopes',
        'altBlueprintConnectionName',
        'WIDAssertionFile',
        'federatedTokenFile',
        'idpmResource',
        'azureRegion',
        'sendX5C',
        'msalRetryCount',
        'sidecarBaseUrl',
        'serviceName',
        'blueprintServiceName',
        'bypassLocalNetworkRestriction',
        'requestTimeout',
        'retryCount',
        'issuers',
        'validateIssuer'
      ],
      authorizationHandlerSettings: [
        'type',
        'azureBotOAuthConnectionName',
        'title',
        'text',
        'invalidSignInRetryMessage',
        'invalidSignInRetryMessageFormat',
        'invalidSignInRetryMaxExceededMessage',
        'oboConnectionName',
        'enableSso',
        'invalidSignInRetryMax',
        'oboScopes',
        'altBlueprintConnectionName',
        'scopes'
      ],
      connectionMapItem: ['serviceUrl', 'audience', 'connection'],
      cloudAdapterOptions: ['emitStackTrace', 'validateServiceUrl'],
      outboundHostValidator: ['enabled', 'includeDefaultMicrosoftHosts', 'hosts']
    } as const

    for (const [definition, properties] of Object.entries(expected)) {
      const schemaProperties = schema.$defs[definition as keyof typeof expected].properties
      const missing = properties.filter(property => !(property in schemaProperties))
      assert.deepEqual(missing, [], `${definition} is missing JavaScript properties`)
    }

    assert.deepEqual(
      schema.$defs.connectionSettings.properties.altBlueprintConnectionName['x-agents-runtimes'],
      ['javascript']
    )
    assert.deepEqual(
      schema.$defs.authorizationHandlerSettings.properties.altBlueprintConnectionName['x-agents-runtimes'],
      ['javascript']
    )
  })

  it('declares runtime-recognized .NET certificate metadata', () => {
    const properties = loadSchema().$defs.connectionSettings.properties
    for (const property of [
      'certificateThumbPrint',
      'certificateSubjectName',
      'certificateStoreName',
      'certificateStoreLocation',
      'validCertificateOnly'
    ]) {
      assert.deepEqual(properties[property]['x-agents-runtimes'], ['dotnet'])
    }
  })

  it('accepts the schema string branch as .NET-only while the JavaScript compiler rejects it', async () => {
    const schema = loadSchema()
    const branches = schema.$defs.connectionSettings.properties.requestTimeout.oneOf ?? []
    const stringBranch = branches.find(branch => branch.type === 'string')
    const dotNetTimeSpan = '00:00:30'

    // The schema documents the .NET TimeSpan string as a valid representation.
    assert.equal(typeof dotNetTimeSpan, stringBranch?.type)
    assert.ok(dotNetTimeSpan.length >= (stringBranch?.minLength ?? 1))

    // The JavaScript document compiler rejects that same .NET-only representation.
    await assert.rejects(
      preloadConfigurationSources([{
        source: {
          name: 'requestTimeout-timespan',
          async load () {
            return {
              format: 'document',
              value: {
                connections: {
                  serviceConnection: {
                    settings: { requestTimeout: dotNetTimeSpan }
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

  it('accepts the schema integer branch as the JavaScript millisecond form through the real compiler', async () => {
    await preloadConfigurationSources([{
      source: {
        name: 'requestTimeout-integer',
        async load () {
          return {
            format: 'document',
            value: {
              connections: {
                serviceConnection: {
                  settings: { requestTimeout: 15000 }
                }
              }
            }
          } as const
        }
      },
      mode: 'fallback'
    }])

    assert.equal(
      getConfigurationSnapshot().fallback.connections.get('serviceconnection')?.settings.requestTimeout,
      15000
    )
  })

  it('keeps the documented example on the JavaScript-supported authorization shape', () => {
    const schema = loadSchema()
    const agentApplication = schema.examples[0].agentApplication as ConfigurationDocument
    const userAuthorization = agentApplication.userAuthorization as ConfigurationDocument
    const handlers = userAuthorization.handlers as ConfigurationDocument
    const graph = handlers.graph as ConfigurationDocument
    const settings = graph.settings as ConfigurationDocument
    assert.equal('defaultHandlerName' in userAuthorization, false)
    assert.equal('autoSignIn' in userAuthorization, false)
    assert.equal('type' in graph, false)
    assert.equal(settings.type, 'AzureBotUserAuthorization')
  })

  it('loads the documented example through the real configuration compiler', async () => {
    const schema = loadSchema()
    const [example] = schema.examples

    await preloadConfigurationSources([{
      source: {
        name: 'schema-example',
        async load () {
          return { format: 'document', value: example } as const
        }
      },
      mode: 'fallback'
    }])

    const snapshot = getConfigurationSnapshot().fallback
    assert.equal(snapshot.connections.get('serviceconnection')?.settings.authType, 'ClientSecret')
    assert.equal(
      snapshot.connections.get('serviceconnection')?.settings.clientId,
      '00000000-0000-0000-0000-000000000000'
    )
    assert.deepEqual(snapshot.connectionsMap.get(0), { serviceUrl: '*', connection: 'serviceConnection' })
    assert.equal(snapshot.cloudAdapterOptions.emitStackTrace, false)
    assert.deepEqual(snapshot.outboundHostValidator, {
      enabled: true,
      includeDefaultMicrosoftHosts: true,
      hosts: ['api.contoso.com']
    })
    const graph = snapshot.agentApplication.userAuthorization.handlers.get('graph')
    assert.equal(graph?.settings.type, 'AzureBotUserAuthorization')
    assert.equal(graph?.settings.azureBotOAuthConnectionName, 'graph')
    assert.deepEqual(graph?.settings.oboScopes, ['https://graph.microsoft.com/.default'])
  })

  it('accepts the documented __Settings__ environment nesting in real JavaScript consumers', () => {
    process.env = {
      TEST_MODE: 'true',
      NODE_ENV: 'development',
      Connections__serviceConnection__Settings__clientId: 'schema-env-client-id',
      ConnectionsMap__0__ServiceUrl: '*',
      ConnectionsMap__0__Connection: 'serviceConnection',
      AgentApplication__UserAuthorization__Handlers__graph__Settings__type: 'AgenticUserAuthorization',
      AgentApplication__UserAuthorization__Handlers__graph__Settings__scopes: 'scope-a'
    }

    const authConfig = loadAuthConfigFromEnv()
    assert.equal(authConfig.clientId, 'schema-env-client-id')
    assert.equal(authConfig.connections?.get('serviceConnection')?.clientId, 'schema-env-client-id')
    assert.deepEqual(authConfig.connectionsMap, [{ serviceUrl: '*', connection: 'serviceConnection' }])

    const app = new AgentApplication({ storage: new MemoryStorage() })
    assert.ok(app.authorization)
  })
})
