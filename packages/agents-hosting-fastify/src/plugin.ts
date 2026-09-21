/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import rateLimit, { type RateLimitPluginOptions } from '@fastify/rate-limit'
import {
  ActivityHandler,
  AgentApplication,
  AuthConfiguration,
  authorizeJWT,
  getAuthConfigWithDefaults,
  Request,
  TurnState
} from '@microsoft/agents-hosting'
import { createCloudAdapter } from '@microsoft/agents-hosting'
import { adaptReply } from './replyAdapter'

/**
 * Options accepted by the `@microsoft/agents-hosting-fastify` plugin.
 */
export interface AgentsHostingFastifyPluginOptions {
  /**
   * The AgentApplication or ActivityHandler instance to process incoming
   * activities.
   */
  agent: AgentApplication<TurnState<any, any>> | ActivityHandler

  /**
   * Optional custom authentication configuration. If not provided,
   * configuration will be loaded from environment variables.
   */
  authConfig?: AuthConfiguration

  /**
   * The route path for the agent messages endpoint. Defaults to `'/api/messages'`.
   */
  routePath?: string

  /**
   * Optional rate-limit options passed directly to `@fastify/rate-limit`.
   * When provided, the plugin registers `@fastify/rate-limit` before the
   * messages route.
   */
  rateLimit?: RateLimitPluginOptions

  /**
   * Maximum request body size in bytes for the agent messages route, applied
   * per-route so other routes on the same Fastify instance are unaffected.
   *
   * Defaults to `102400` (100 KB) to match `express.json()`'s default in
   * `@microsoft/agents-hosting-express`.
   */
  bodyLimit?: number
}

const pluginImpl: FastifyPluginAsync<AgentsHostingFastifyPluginOptions> = async (
  fastify: FastifyInstance,
  opts: AgentsHostingFastifyPluginOptions
) => {
  const authConfig = getAuthConfigWithDefaults(opts.authConfig)
  const { adapter, headerPropagation } = createCloudAdapter(opts.agent, authConfig)
  const jwtMiddleware = authorizeJWT(authConfig)
  const routePath = opts.routePath ?? '/api/messages'

  if (opts.rateLimit) {
    // Register globally disabled so only routes that opt in (via config.rateLimit) are throttled.
    // This prevents other routes registered on the same Fastify instance from being rate-limited.
    await fastify.register(rateLimit, { ...opts.rateLimit, global: false })
  }

  const bodyLimit = opts.bodyLimit ?? 102400
  fastify.post(routePath, {
    config: opts.rateLimit ? { rateLimit: opts.rateLimit } : {},
    bodyLimit
  }, async (request: FastifyRequest, reply: FastifyReply) => {
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
    if (!nextCalled || adaptedRes.headersSent) {
      return
    }
    if (adaptedReq.user !== undefined) {
      ;(request as FastifyRequest & { user?: unknown }).user = adaptedReq.user
    }
    await adapter.process(
      adaptedReq,
      adaptedRes,
      (context) => opts.agent.run(context),
      headerPropagation
    )
  })
}

/**
 * Fastify plugin that registers the agent messages route with JWT
 * authorization (and optionally rate limiting). The plugin is encapsulated —
 * register it with a `prefix` to mount under a subpath.
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify'
 * import agentsPlugin from '@microsoft/agents-hosting-fastify'
 * import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
 *
 * const fastify = Fastify()
 * const agent = new AgentApplication<TurnState>()
 * await fastify.register(agentsPlugin, { agent })
 * await fastify.listen({ port: 3978 })
 * ```
 */
const agentsHostingFastifyPlugin: FastifyPluginAsync<AgentsHostingFastifyPluginOptions> = pluginImpl

export default agentsHostingFastifyPlugin
