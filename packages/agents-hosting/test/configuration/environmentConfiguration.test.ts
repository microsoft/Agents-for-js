/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  loadModernEnvironmentConfiguration
} from '../../src/configuration/environmentConfiguration'
import {
  loadBotFrameworkAuthorizationEnvironmentConfiguration,
  loadBotFrameworkEnvironmentConfiguration,
  loadBotFrameworkPrefixedEnvironmentConfiguration
} from '../../src/configuration/botFrameworkEnvironmentCompatibility'
import {
  createConfigurationLayer,
  mergeConfigurationLayers,
  setConfigurationValue
} from '../../src/configuration/configuration'

describe('environment configuration adapters', () => {
  async function captureDiagnostics (fn: () => void): Promise<string> {
    const debugModule = await import('debug')
    const previous = (debugModule.default as any).disable()
    ;(debugModule.default as any).enable('agents:cloud-adapter:*')
    const calls: string[] = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    ;(process.stderr.write as any) = (chunk: any) => {
      calls.push(String(chunk))
      return true
    }
    try {
      fn()
    } finally {
      ;(process.stderr.write as any) = originalWrite
      ;(debugModule.default as any).disable()
      if (previous) {
        ;(debugModule.default as any).enable(previous)
      }
    }
    return calls.join('')
  }

  it('maps every supported modern __ section onto the hierarchical layer', () => {
    const layer = loadModernEnvironmentConfiguration({
      Connections__Primary__Settings__clientId: 'client',
      Connections__Primary__Settings__sendX5C: 'true',
      ConnectionsMap__7__ServiceUrl: 'https://service.example',
      ConnectionsMap__7__Connection: 'Primary',
      CloudAdapterOptions__emitStackTrace: '1',
      OutboundHostValidator__Enabled: 'true',
      OutboundHostValidator__Hosts: 'api.example, graph.example',
      OutboundHostValidator__Hosts__4: 'files.example',
      AgentApplication__UserAuthorization__Handlers__Graph__Settings__type: 'AgenticUserAuthorization',
      AgentApplication__UserAuthorization__Handlers__graph__Settings__scopes: 'scope-a scope-b'
    })

    assert.deepEqual(layer.connections.get('primary'), {
      id: 'Primary',
      settings: { clientId: 'client', sendX5C: true }
    })
    assert.deepEqual(layer.connectionsMap.get(7), {
      serviceUrl: 'https://service.example',
      connection: 'Primary'
    })
    assert.deepEqual(layer.cloudAdapterOptions, { emitStackTrace: true })
    assert.deepEqual(layer.outboundHostValidator, {
      enabled: true,
      hosts: ['api.example', 'graph.example', 'files.example']
    })
    assert.deepEqual(
      layer.agentApplication.userAuthorization.handlers.get('graph'),
      {
        id: 'Graph',
        settings: {
          type: 'AgenticUserAuthorization',
          scopes: ['scope-a', 'scope-b']
        }
      }
    )
  })

  it('suggests fixed names across the modern environment hierarchy without rejecting extensions', async () => {
    const typoKeys = [
      'Conenctions__Primary__Settings__clientId',
      'Connections__Primary__Setings__clientId',
      'Connections__Primary__Settings__clietnId',
      'ConnectionsMap__0__servceUrl',
      'OutboundHostValidator__enabeld',
      'AgentApplication__UserAuthoriztion__Handlers__Graph__Settings__scopes',
      'AgentApplication__UserAuthorization__Handlers__Graph__Settings__scops'
    ]
    const output = await captureDiagnostics(() => {
      const layer = loadModernEnvironmentConfiguration({
        [typoKeys[0]]: 'ignored-root',
        [typoKeys[1]]: 'ignored-structure',
        [typoKeys[2]]: 'extension-value',
        [typoKeys[3]]: 'ignored-property',
        [typoKeys[4]]: 'true',
        [typoKeys[5]]: 'ignored-structure',
        [typoKeys[6]]: 'extension-scope'
      }, { reportCloudAdapterDiagnostics: true })

      assert.equal(layer.connections.get('primary')?.settings.clietnId, 'extension-value')
      assert.equal(
        layer.agentApplication.userAuthorization.handlers.get('graph')?.settings.scops,
        'extension-scope'
      )
    })

    for (const typoKey of typoKeys) {
      assert.match(output, new RegExp(typoKey))
    }
    for (const expected of new Set([
      'Connections__Primary__Settings__clientId',
      'ConnectionsMap__0__serviceUrl',
      'OutboundHostValidator__enabled',
      'AgentApplication__UserAuthorization__Handlers__Graph__Settings__scopes'
    ])) {
      assert.match(output, new RegExp(`Did you mean "${expected}"`))
    }
  })

  it('keeps Bot Framework flat and prefixed connection bindings isolated', () => {
    const flat = loadBotFrameworkEnvironmentConfiguration({
      MicrosoftAppId: 'flat-client',
      MicrosoftAppPassword: 'flat-secret',
      Connections__Primary__Settings__clientId: 'modern-client'
    })
    const prefixed = loadBotFrameworkPrefixedEnvironmentConfiguration('named', {
      named_ClientId: 'named-client',
      named_Scope: 'scope-a scope-b',
      Connections__Primary__Settings__clientId: 'modern-client'
    })

    assert.deepEqual(flat.connections.get('serviceconnection'), {
      id: 'serviceConnection',
      settings: {
        clientId: 'flat-client',
        clientSecret: 'flat-secret'
      }
    })
    assert.deepEqual(prefixed.connections.get('named'), {
      id: 'named',
      settings: {
        clientId: 'named-client',
        scopes: ['scope-a', 'scope-b']
      }
    })
  })

  it('maps only known Bot Framework handler bindings and reports replacements', () => {
    const compatibility = loadBotFrameworkAuthorizationEnvironmentConfiguration(
      ['Graph'],
      {
        Graph_connectionName: 'graph-oauth',
        graph_obo_scopes: 'scope-a,scope-b',
        Unknown_connectionName: 'ignored'
      }
    )

    assert.deepEqual(
      compatibility.layer.agentApplication.userAuthorization.handlers.get('graph'),
      {
        id: 'Graph',
        settings: {
          azureBotOAuthConnectionName: 'graph-oauth',
          oboScopes: ['scope-a', 'scope-b']
        }
      }
    )
    assert.equal(compatibility.replacements.length, 2)
    assert.ok(compatibility.replacements.every(({ modernKey }) =>
      modernKey.startsWith('AgentApplication__UserAuthorization__Handlers__Graph__Settings__')
    ))
  })

  it('merges sparse hierarchical patches by schema section', () => {
    const fallback = createConfigurationLayer()
    setConfigurationValue(
      fallback,
      'connectionsMap.7.serviceUrl',
      'https://service.example',
      'fallback',
      'canonical'
    )
    const override = createConfigurationLayer()
    setConfigurationValue(
      override,
      'connectionsMap.7.connection',
      'primary',
      'override',
      'canonical'
    )
    setConfigurationValue(
      override,
      'outboundHostValidator.hosts',
      'override.example',
      'override',
      'canonical'
    )

    const merged = mergeConfigurationLayers(fallback, override)
    assert.deepEqual(merged.connectionsMap.get(7), {
      serviceUrl: 'https://service.example',
      connection: 'primary'
    })
    assert.deepEqual(merged.outboundHostValidator.hosts, ['override.example'])
  })
})
