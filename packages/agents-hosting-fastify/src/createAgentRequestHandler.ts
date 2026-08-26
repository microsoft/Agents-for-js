/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  ActivityHandler,
  AgentApplication,
  AuthConfiguration,
  authorizeJWT,
  getAuthConfigWithDefaults,
  Request,
  TurnState
} from '@microsoft/agents-hosting'
import { createCloudAdapter, type CreateCloudAdapterOptions } from '@microsoft/agents-hosting'
import { adaptReply } from './replyAdapter'

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
  const configurationContext = options?.configurationContext ??
    (agent instanceof AgentApplication ? agent.options.configurationContext : undefined)
  const authConfig = getAuthConfigWithDefaults(authConfiguration, { configurationContext })
  const jwtMiddleware = authorizeJWT(authConfig)
  const { adapter, headerPropagation } = createCloudAdapter(agent, authConfig, options)

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const adaptedReq: Request = {
      method: request.method,
      headers: request.headers as Record<string, string | string[] | undefined>,
      body: (request.body ?? undefined) as Record<string, unknown> | undefined
    }
    const adaptedRes = adaptReply(reply)

    let middlewareError: any
    let nextCalled = false

    await jwtMiddleware(adaptedReq, adaptedRes, (err?: any) => {
      nextCalled = true
      middlewareError = err
    })

    if (middlewareError) {
      throw middlewareError
    }

    // If the middleware handled the response without calling next (e.g., 401), don't process the activity.
    if (!nextCalled || adaptedRes.headersSent) {
      return
    }

    // Propagate JwtPayload mutation from middleware to the original request so
    // downstream Fastify hooks can read `request.user`.
    if (adaptedReq.user !== undefined) {
      ;(request as FastifyRequest & { user?: unknown }).user = adaptedReq.user
    }

    await adapter.process(
      adaptedReq,
      adaptedRes,
      (context) => agent.run(context),
      headerPropagation
    )
  }
}
