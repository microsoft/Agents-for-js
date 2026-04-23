/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import express, { Response } from 'express'
import rateLimit from 'express-rate-limit'
import { ActivityHandler, AgentApplication, AuthConfiguration, authorizeJWT, getAuthConfigWithDefaults, Request, TurnState } from '@microsoft/agents-hosting'
import { version } from '@microsoft/agents-hosting/package.json'
import { createCloudAdapter } from './createCloudAdapter'

/**
 * Options for configuring the Express server started by `startServer`.
 */
export interface StartServerOptions {
  /**
   * Optional custom authentication configuration.
   * If not provided, configuration will be loaded from environment variables using loadAuthConfigFromEnv().
   */
  authConfig?: AuthConfiguration

  /**
   * The port to listen on. Defaults to `process.env.PORT` or `3978`.
   */
  port?: number | string

  /**
   * The route path for the agent messages endpoint. Defaults to `'/api/messages'`.
   */
  routePath?: string

  /**
   * A callback invoked with the Express app before `listen()` is called.
   * Use this to add custom routes, middleware, or static file serving.
   *
   * @example
   * ```typescript
   * startServer(agent, {
   *   beforeListen: (app) => {
   *     app.get('/health', (req, res) => res.json({ status: 'ok' }));
   *   }
   * });
   * ```
   */
  beforeListen?: (app: express.Express) => void
}

/**
 * Starts an Express server for handling Agent requests.
 *
 * @param agent - The AgentApplication or ActivityHandler instance to process incoming activities.
 * @param options - Optional configuration. Accepts either a `StartServerOptions` object or
 * an `AuthConfiguration` for backward compatibility.
 * @returns The Express server instance.
 *
 * @remarks
 * This function sets up an Express server with the necessary middleware and routes for handling
 * agent requests. It configures JWT authorization middleware on the messages route and sets up the endpoint.
 * The server will listen on the port specified in options, the PORT environment variable, or 3978 by default.
 *
 * @example
 * ```typescript
 * // Basic usage
 * import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
 * import { startServer } from '@microsoft/agents-hosting-express';
 *
 * const app = new AgentApplication<TurnState>();
 * startServer(app);
 * ```
 *
 * @example
 * ```typescript
 * // With options
 * import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
 * import { startServer } from '@microsoft/agents-hosting-express';
 *
 * const app = new AgentApplication<TurnState>();
 * startServer(app, {
 *   port: 8080,
 *   routePath: '/bot/messages',
 *   beforeListen: (server) => {
 *     server.get('/health', (req, res) => res.json({ status: 'ok' }));
 *   }
 * });
 * ```
 */
export function startServer (agent: AgentApplication<TurnState<any, any>> | ActivityHandler, options?: StartServerOptions): express.Express
export function startServer (agent: AgentApplication<TurnState<any, any>> | ActivityHandler, authConfiguration?: AuthConfiguration): express.Express
export function startServer (agent: AgentApplication<TurnState<any, any>> | ActivityHandler, optionsOrAuth?: StartServerOptions | AuthConfiguration): express.Express {
  const isOptions = typeof optionsOrAuth === 'object' && optionsOrAuth !== null &&
    ('authConfig' in optionsOrAuth || 'port' in optionsOrAuth || 'routePath' in optionsOrAuth || 'beforeListen' in optionsOrAuth)

  const opts: StartServerOptions = isOptions ? optionsOrAuth as StartServerOptions : { authConfig: optionsOrAuth as AuthConfiguration | undefined }
  const authConfig: AuthConfiguration = getAuthConfigWithDefaults(opts.authConfig)
  const routePath = opts.routePath ?? '/api/messages'
  const { adapter, headerPropagation } = createCloudAdapter(agent, authConfig)

  const server = express()
  server.use(express.json())

  if (opts.beforeListen && typeof opts.beforeListen === 'function') {
    opts.beforeListen(server)
  }

  const messagesRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false
  })

  server.post(routePath, messagesRateLimiter, authorizeJWT(authConfig), (req: Request, res: Response) =>
    adapter.process(req, res, (context) =>
      agent.run(context)
    , headerPropagation)
  )

  const port = opts.port ?? process.env.PORT ?? 3978
  server.listen(port, async () => {
    console.log(`\nServer listening to port ${port} on sdk ${version} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
  }).on('error', console.error)
  return server
}
