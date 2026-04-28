/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import express, { Response } from 'express'
import { ActivityHandler, AgentApplication, AuthConfiguration, authorizeJWT, CloudAdapter, getAuthConfigWithDefaults, HeaderPropagationDefinition, Request, TurnState } from '@microsoft/agents-hosting'
import { version } from '@microsoft/agents-hosting/package.json'

export interface StartServerOptions {
  authConfiguration?: AuthConfiguration
  configureAdapter?: (adapter: CloudAdapter) => void
}

function isStartServerOptions (value: AuthConfiguration | StartServerOptions | undefined): value is StartServerOptions {
  return !!value && (
    'authConfiguration' in value ||
    'configureAdapter' in value
  )
}

function getStartServerOptions (authConfigurationOrOptions?: AuthConfiguration | StartServerOptions): StartServerOptions {
  if (isStartServerOptions(authConfigurationOrOptions)) {
    return authConfigurationOrOptions
  }

  return { authConfiguration: authConfigurationOrOptions }
}
/**
 * Starts an Express server for handling Agent requests.
 *
 * @param agent - The AgentApplication or ActivityHandler instance to process incoming activities.
 * @param authConfigurationOrOptions - Optional custom authentication configuration or server startup options.
 * @returns {express.Express} - The Express server instance.
 *
 * @remarks
 * This function sets up an Express server with the necessary middleware and routes for handling
 * agent requests. It configures JWT authorization middleware and sets up the message endpoint.
 * Use `configureAdapter` when you need to attach middleware or otherwise customize the
 * adapter created for an `ActivityHandler` or reused from an `AgentApplication`.
 * The server will listen on the port specified in the PORT environment variable (or 3978 by default)
 * and logs startup information including the SDK version and configured app ID.
 *
 * @example
 * ```typescript
 * import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
 * import { startServer } from '@microsoft/agents-hosting-express';
 *
 * const app = new AgentApplication<TurnState>();
 * app.onMessage('hello', async (context, state) => {
 *   await context.sendActivity('Hello, world!');
 * });
 *
 * startServer(app);
 *
 * startServer(app, {
 *   configureAdapter: (adapter) => {
 *     // Example: add custom middleware
 *   }
 * });
 * ```
 *
 */
export function startServer (agent: AgentApplication<TurnState<any, any>> | ActivityHandler, authConfiguration?: AuthConfiguration): express.Express
export function startServer (agent: AgentApplication<TurnState<any, any>> | ActivityHandler, options?: StartServerOptions): express.Express
export function startServer (agent: AgentApplication<TurnState<any, any>> | ActivityHandler, authConfigurationOrOptions?: AuthConfiguration | StartServerOptions) : express.Express {
  const options = getStartServerOptions(authConfigurationOrOptions)
  const authConfig: AuthConfiguration = getAuthConfigWithDefaults(options.authConfiguration)
  let adapter: CloudAdapter
  let headerPropagation: HeaderPropagationDefinition | undefined
  if (agent instanceof ActivityHandler || !agent.adapter) {
    adapter = new CloudAdapter()
  } else {
    adapter = agent.adapter as CloudAdapter
    headerPropagation = (agent as AgentApplication<TurnState<any, any>>)?.options.headerPropagation
  }

  options.configureAdapter?.(adapter)

  const server = express()
  server.use(express.json())
  server.use(authorizeJWT(authConfig))

  server.post('/api/messages', (req: Request, res: Response) =>
    adapter.process(req, res, (context) =>
      agent.run(context)
    , headerPropagation)
  )

  const port = process.env.PORT || 3978
  server.listen(port, async () => {
    console.log(`\nServer listening to port ${port} on sdk ${version} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
  }).on('error', console.error)
  return server
}
