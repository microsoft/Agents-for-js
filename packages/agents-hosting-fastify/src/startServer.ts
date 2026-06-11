/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest, type FastifyServerOptions } from 'fastify'
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
import { version } from '@microsoft/agents-hosting/package.json'
import { debug } from '@microsoft/agents-telemetry'
import { adaptReply } from './replyAdapter'

const logger = debug('agents:hosting-fastify')

/**
 * Options for configuring the Fastify server started by `startServer`.
 */
export interface StartServerOptions {
  /**
   * Optional custom authentication configuration.
   * If not provided, configuration will be loaded from environment variables using loadAuthConfigFromEnv().
   */
  authConfig?: AuthConfiguration

  /**
   * The port to listen on. Defaults to `process.env.PORT` or `3978`.
   *
   * A non-numeric string is treated as a listen target path (Unix domain socket
   * or Windows named pipe) and passed to Fastify via `path` rather than `port`.
   */
  port?: number | string

  /**
   * The route path for the agent messages endpoint. Defaults to `'/api/messages'`.
   */
  routePath?: string

  /**
   * Optional rate limiting configuration for the messages endpoint.
   * Passed directly to `@fastify/rate-limit`. If not provided, no rate
   * limiting is applied.
   *
   * @example
   * ```typescript
   * startServer(agent, {
   *   rateLimit: {
   *     timeWindow: '15 minutes',
   *     max: 1000
   *   }
   * })
   * ```
   */
  rateLimit?: RateLimitPluginOptions

  /**
   * Optional Fastify server options forwarded to `Fastify()` (e.g. `logger`,
   * `trustProxy`, `https`). Note: setting `bodyLimit` here applies to the
   * entire Fastify instance; prefer the route-scoped `bodyLimit` option
   * (below) so user-registered routes added via `beforeListen` are not
   * affected by the agent endpoint's limit.
   */
  fastifyOptions?: FastifyServerOptions

  /**
   * Maximum request body size in bytes for the agent messages route, applied
   * per-route. User routes added via `beforeListen` are unaffected.
   *
   * Defaults to `102400` (100 KB) to match the default of `express.json()` in
   * `@microsoft/agents-hosting-express`, keeping the DoS surface comparable
   * across both hosting integrations.
   */
  bodyLimit?: number

  /**
   * A callback invoked with the Fastify instance after the agent messages
   * route and rate-limit plugin have been registered but before
   * `fastify.listen()`. Use this to add custom routes, hooks, or plugins.
   *
   * Custom routes added here are NOT protected by the agent's JWT middleware
   * because that middleware is registered per-route on the messages endpoint
   * only.
   *
   * @example
   * ```typescript
   * startServer(agent, {
   *   beforeListen: async (fastify) => {
   *     fastify.get('/health', async () => ({ status: 'ok' }))
   *   }
   * })
   * ```
   */
  beforeListen?: (fastify: FastifyInstance) => void | Promise<void>
}

/**
 * Starts a Fastify server for handling Agent requests.
 *
 * @param agent - The AgentApplication or ActivityHandler instance to process incoming activities.
 * @param options - Optional configuration. Accepts either a `StartServerOptions` object or
 * an `AuthConfiguration` for parity with `@microsoft/agents-hosting-express`.
 * @returns A promise that resolves to the listening Fastify instance.
 *
 * @remarks
 * Fastify parses JSON bodies automatically for any registered content-type, so
 * no equivalent of `express.json()` is required. JWT authorization is applied
 * per-route to the messages endpoint only, so custom routes added via
 * `beforeListen` remain unauthenticated.
 *
 * @example
 * ```typescript
 * import { AgentApplication, TurnState } from '@microsoft/agents-hosting'
 * import { startServer } from '@microsoft/agents-hosting-fastify'
 *
 * const app = new AgentApplication<TurnState>()
 * await startServer(app)
 * ```
 */
export function startServer (
  agent: AgentApplication<TurnState<any, any>> | ActivityHandler,
  options?: StartServerOptions
): Promise<FastifyInstance>
export function startServer (
  agent: AgentApplication<TurnState<any, any>> | ActivityHandler,
  authConfiguration?: AuthConfiguration
): Promise<FastifyInstance>
export async function startServer (
  agent: AgentApplication<TurnState<any, any>> | ActivityHandler,
  optionsOrAuth?: StartServerOptions | AuthConfiguration
): Promise<FastifyInstance> {
  const isOptions = typeof optionsOrAuth === 'object' && optionsOrAuth !== null &&
    ('authConfig' in optionsOrAuth || 'port' in optionsOrAuth || 'routePath' in optionsOrAuth ||
      'rateLimit' in optionsOrAuth || 'beforeListen' in optionsOrAuth || 'fastifyOptions' in optionsOrAuth ||
      'bodyLimit' in optionsOrAuth)

  // Legacy overload: the second argument is a raw AuthConfiguration. An empty object carries no auth
  // settings, so treat it like no argument and load defaults from the environment (matching startServer(agent)).
  const hasAuthSettings = !isOptions && optionsOrAuth != null && Object.keys(optionsOrAuth).length > 0
  const opts: StartServerOptions = isOptions
    ? optionsOrAuth as StartServerOptions
    : { authConfig: hasAuthSettings ? optionsOrAuth as AuthConfiguration : undefined }

  const routePath = opts.routePath ?? '/api/messages'
  const authConfig = getAuthConfigWithDefaults(opts.authConfig)
  const { adapter, headerPropagation } = createCloudAdapter(agent, authConfig)
  const jwtMiddleware = authorizeJWT(authConfig)
  const fastify = Fastify(opts.fastifyOptions)

  if (opts.rateLimit) {
    // Register globally disabled so only routes that opt in (via config.rateLimit) are throttled.
    // This prevents user routes added in beforeListen (e.g. /health) from being rate-limited.
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
      (context) => agent.run(context),
      headerPropagation
    )
  })

  if (opts.beforeListen && typeof opts.beforeListen === 'function') {
    await opts.beforeListen(fastify)
  }

  const port = opts.port ?? process.env.PORT ?? 3978
  const className = (obj: any) => obj?.constructor?.name ?? (obj ? 'custom' : undefined)
  logger.info('Fastify server settings loaded', {
    messageEndpoint: `POST ${routePath}`,
    port: {
      value: port,
      source: opts.port ? 'options' : process.env.PORT ? 'env' : 'default'
    },
    rateLimit: opts.rateLimit ? 'enabled' : 'disabled',
    adapter: {
      className: className(adapter),
      source: agent instanceof ActivityHandler || !agent.adapter ? 'created' : 'agent.adapter'
    },
    headerPropagation: headerPropagation !== undefined ? 'enabled' : 'disabled'
  })

  // Fastify listens on a numeric TCP port, but `PORT` (or opts.port) may be a
  // non-numeric string such as a Unix domain socket path or a Windows named
  // pipe. Those must be passed to Fastify via `path`, not `port`.
  const numericPort = typeof port === 'number'
    ? port
    : /^\d+$/.test(port) ? Number(port) : undefined
  if (numericPort !== undefined) {
    await fastify.listen({ port: numericPort, host: '0.0.0.0' })
  } else {
    await fastify.listen({ path: port as string })
  }
  console.log(
    `\nServer listening to ${numericPort !== undefined ? `port ${numericPort}` : `path ${port}`} on sdk ${version} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`
  )
  return fastify
}
