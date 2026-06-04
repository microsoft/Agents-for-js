/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActivityHandler } from './activityHandler'
import { AgentApplication } from './app/agentApplication'
import { AuthConfiguration } from './auth/authConfiguration'
import { CloudAdapter } from './cloudAdapter'
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
 * Creates a CloudAdapter for the given agent.
 *
 * If the agent is an AgentApplication with a pre-configured adapter, that adapter is reused.
 * Otherwise, a new CloudAdapter is created.
 *
 * @param agent - The AgentApplication or ActivityHandler instance.
 * @param authConfig - Optional auth configuration used when creating a new CloudAdapter.
 * If the agent already has an adapter, that adapter is reused and this value is ignored.
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
  authConfig?: AuthConfiguration
): CloudAdapterResult => {
  if (agent instanceof ActivityHandler) {
    return { adapter: new CloudAdapter(authConfig), headerPropagation: undefined }
  }

  // AgentApplication: reuse its pre-configured adapter when present, otherwise create one.
  // headerPropagation is an application-level option, so read it regardless of adapter source.
  const headerPropagation = agent.options?.headerPropagation
  const adapter = agent.adapter ?? new CloudAdapter(authConfig)
  return { adapter, headerPropagation }
}
