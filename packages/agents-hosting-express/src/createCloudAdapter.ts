/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActivityHandler, AgentApplication, AuthConfiguration, CloudAdapter, HeaderPropagationDefinition, TurnState } from '@microsoft/agents-hosting'

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
 * import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
 * import { createCloudAdapter } from '@microsoft/agents-hosting-express';
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
  let adapter: CloudAdapter
  let headerPropagation: HeaderPropagationDefinition | undefined
  if (agent instanceof ActivityHandler || !agent.adapter) {
    adapter = new CloudAdapter(authConfig)
  } else {
    adapter = agent.adapter as CloudAdapter
    headerPropagation = (agent as AgentApplication<TurnState<any, any>>)?.options.headerPropagation
  }
  return { adapter, headerPropagation }
}
