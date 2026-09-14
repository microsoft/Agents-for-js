/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActivityHandler } from './activityHandler'
import { AgentApplication } from './app/agentApplication'
import { AuthConfiguration } from './auth/authConfiguration'
import { CloudAdapter } from './cloudAdapter'
import { ConfigurationContext } from './configuration/configuration'
import { HeaderPropagationDefinition } from './headerPropagation'
import { TurnState } from './app/turnState'

/**
 * Result of creating a CloudAdapter from an agent.
 */
export interface CloudAdapterResult {
  adapter: CloudAdapter
  headerPropagation: HeaderPropagationDefinition | undefined
}

/**
 * Options accepted by {@link createCloudAdapter} when creating a new `CloudAdapter` for an agent
 * that does not already own one.
 *
 * @remarks
 * This is the single named options type shared by the `@microsoft/agents-hosting-express` and
 * `@microsoft/agents-hosting-fastify` convenience APIs (`createAgentRequestHandler`,
 * `startServer`, and the Fastify plugin) so every hosting entry point resolves auth and
 * constructs a `CloudAdapter` through the same path.
 */
export interface CreateCloudAdapterOptions {
  /**
   * Optional host-scoped external configuration used to resolve the authentication
   * configuration and runtime options of a newly created `CloudAdapter` (e.g. `emitStackTrace`,
   * `validateServiceUrl`, outbound host validation).
   *
   * For an `AgentApplication`, this defaults to `agent.options.configurationContext` when
   * omitted. A plain `ActivityHandler` has no built-in context, so it must be supplied here to
   * participate in host-scoped configuration.
   */
  configurationContext?: ConfigurationContext
}

/**
 * Creates a CloudAdapter for the given agent.
 *
 * An `AgentApplication`'s pre-configured adapter is always reused when available, preserving
 * its identity, middleware, connection manager, and runtime policy. The auth configuration is
 * used only when a new adapter must be created.
 *
 * @param agent - The AgentApplication or ActivityHandler instance.
 * @param authConfig - Optional auth configuration used when creating a new adapter. If the
 * application already owns an adapter, this value does not replace or reconfigure it.
 * @param options - Optional additional settings, such as a host-scoped {@link ConfigurationContext}.
 * @returns An object containing the CloudAdapter and optional header propagation configuration.
 *
 * @example
 * ```typescript
 * import { AgentApplication, TurnState, createCloudAdapter } from '@microsoft/agents-hosting';
 *
 * const app = new AgentApplication<TurnState>();
 * const { adapter, headerPropagation } = createCloudAdapter(app, { clientId: process.env.CLIENT_ID });
 *
 * // Use the adapter directly with request/response objects compatible with CloudAdapter.process
 * adapter.process(req, res, (context) => app.run(context), headerPropagation);
 * ```
 */
export const createCloudAdapter = (
  agent: AgentApplication<TurnState<any, any>> | ActivityHandler,
  authConfig?: AuthConfiguration,
  options?: CreateCloudAdapterOptions
): CloudAdapterResult => {
  const configurationContext = options?.configurationContext ??
    (agent instanceof AgentApplication ? agent.options.configurationContext : undefined)

  if (agent instanceof ActivityHandler) {
    return {
      adapter: new CloudAdapter(
        authConfig,
        undefined,
        undefined,
        { configurationContext }
      ),
      headerPropagation: undefined
    }
  }

  // Preserve the application-owned processing adapter regardless of host authorization settings.
  // Hosting integrations perform their independent inbound authorization stage before processing.
  const headerPropagation = agent.options?.headerPropagation
  const adapter = agent.adapter ?? new CloudAdapter(
    authConfig,
    undefined,
    undefined,
    { configurationContext }
  )
  return { adapter, headerPropagation }
}
