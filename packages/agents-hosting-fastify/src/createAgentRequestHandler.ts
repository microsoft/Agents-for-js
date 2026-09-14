/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import { ActivityHandler, AgentApplication, AuthConfiguration, TurnState } from '@microsoft/agents-hosting'
import { type CreateCloudAdapterOptions } from '@microsoft/agents-hosting'
import { createAgentRequestHandlerInternal } from './createAgentRequestHandlerInternal'

/**
 * Fastify-native handler signature. Receives a `FastifyRequest` and
 * `FastifyReply`, processes the incoming activity through the agent, and
 * returns a promise that resolves when the response has been written.
 */
export type FastifyAgentRequestHandler = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>

/**
 * Creates a Fastify-native request handler for processing Agent activities.
 *
 * JWT authorization is applied within the handler before the activity is
 * processed. The handler reuses `authorizeJWT` from `@microsoft/agents-hosting`
 * by invoking it with a synthetic `next` callback, mirroring the pattern used
 * by `createAgentRequestHandler` in `@microsoft/agents-hosting-express`.
 *
 * @param agent - The AgentApplication or ActivityHandler instance to process
 * incoming activities.
 * @param authConfiguration - Optional custom authentication configuration. If
 * not provided, configuration will be loaded from environment variables using
 * `loadAuthConfigFromEnv()`.
 * @param options - Optional additional settings, such as a host-scoped
 * `ConfigurationContext`. For an `AgentApplication`, this defaults to its own
 * `configurationContext` option when omitted; a plain `ActivityHandler` has no
 * built-in context and must be supplied here to participate in host-scoped
 * configuration.
 * @returns A Fastify route handler function `(request, reply) => Promise<void>`.
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify'
 * import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
 * import { createAgentRequestHandler } from '@microsoft/agents-hosting-fastify'
 *
 * const agent = new AgentApplication<TurnState>()
 * const handler = createAgentRequestHandler(agent)
 *
 * const fastify = Fastify()
 * fastify.post('/api/messages', handler)
 * await fastify.listen({ port: 3978 })
 * ```
 */
export const createAgentRequestHandler = (
  agent: AgentApplication<TurnState<any, any>> | ActivityHandler,
  authConfiguration?: AuthConfiguration,
  options?: CreateCloudAdapterOptions
): FastifyAgentRequestHandler => {
  return createAgentRequestHandlerInternal(agent, authConfiguration, options).handler
}
