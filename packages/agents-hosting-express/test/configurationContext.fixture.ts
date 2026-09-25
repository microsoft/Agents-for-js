/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  AgentApplication,
  createConfigurationContext,
  preloadConfigurationSources,
  type ConfigurationContext,
  type TurnState
} from '@microsoft/agents-hosting'

export async function preloadAnonymousGlobalConfiguration (): Promise<void> {
  await preloadConfigurationSources([{
    source: {
      name: 'anonymous-global-auth',
      async load () {
        return {
          format: 'canonical',
          values: {
            'connections.global.settings.clientId': '',
            'connectionsMap.0.serviceUrl': '*',
            'connectionsMap.0.connection': 'global'
          }
        } as const
      }
    },
    mode: 'overrideEnvironment'
  }])
}

export async function createContextAuthenticatedAgent (): Promise<AgentApplication<TurnState>> {
  const configurationContext = await createConfigurationContext([{
    source: {
      name: 'scoped-auth',
      async load () {
        return {
          format: 'canonical',
          values: {
            'connections.scoped.settings.clientId': 'scoped-client-id',
            'connectionsMap.0.serviceUrl': '*',
            'connectionsMap.0.connection': 'scoped'
          }
        } as const
      }
    },
    mode: 'enforce'
  }])

  return new AgentApplication({ configurationContext })
}

/**
 * A host-scoped configuration context carrying only scoped auth settings, for use directly with a
 * plain `ActivityHandler` (which has no `configurationContext` option of its own) through the
 * `configurationContext` option accepted by `createAgentRequestHandler`, `startServer`, and the
 * Fastify plugin.
 */
export async function createScopedConfigurationContext (): Promise<ConfigurationContext> {
  return await createConfigurationContext([{
    source: {
      name: 'scoped-activity-handler-auth',
      async load () {
        return {
          format: 'canonical',
          values: {
            'connections.serviceConnection.settings.clientId': 'scoped-client-id',
            'connectionsMap.0.serviceUrl': '*',
            'connectionsMap.0.connection': 'serviceConnection'
          }
        } as const
      }
    },
    mode: 'enforce'
  }])
}

/**
 * A host-scoped configuration context that, alongside scoped auth settings, also carries
 * `CloudAdapterOptions` (`emitStackTrace`) and structured `outboundHostValidator` settings — used
 * to prove those adapter-level settings flow through the same `configurationContext` option for a
 * plain `ActivityHandler`.
 */
export async function createScopedAdapterConfigurationContext (): Promise<ConfigurationContext> {
  return await createConfigurationContext([{
    source: {
      name: 'scoped-activity-handler-adapter',
      async load () {
        return {
          format: 'document',
          value: {
            connections: {
              scopedAdapter: { settings: { clientId: 'scoped-adapter-client-id' } }
            },
            connectionsMap: [{ serviceUrl: '*', connection: 'scopedAdapter' }],
            cloudAdapterOptions: { emitStackTrace: true },
            outboundHostValidator: {
              enabled: true,
              includeDefaultMicrosoftHosts: false,
              hosts: ['scoped.contoso.com']
            }
          }
        } as const
      }
    },
    mode: 'enforce'
  }])
}
