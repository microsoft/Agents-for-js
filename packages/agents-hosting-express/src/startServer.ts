/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import express, { Response } from 'express'
import { ActivityHandler, AgentApplication, AuthConfiguration, authorizeJWT, CloudAdapter, loadAuthConfigFromEnv, Request, TurnState } from '@microsoft/agents-hosting'

/**
 * Starts an Express server for handling Agent requests.
 *
 * @param agent - The AgentApplication instance to process incoming activities.
 * @param authConfiguration - Optional custom authentication configuration. If not provided,
 *                           configuration will be loaded from environment variables.
 * @returns void
 *
 * @remarks
 * This function sets up an Express server with the necessary middleware and routes for handling
 * bot requests. It configures JWT authorization middleware and sets up the message endpoint.
 * The server will listen on the port specified in the environment (or 3978 by default).
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
 * ```
 */
export const startServer = (agent: AgentApplication<TurnState<any, any>> | ActivityHandler, authConfiguration?: AuthConfiguration) => {
  const authConfig: AuthConfiguration = authConfiguration ?? loadAuthConfigFromEnv()
  let adapter: CloudAdapter
  if (agent instanceof ActivityHandler || !agent.adapter) {
    adapter = new CloudAdapter(authConfig)
  } else {
    adapter = agent.adapter as CloudAdapter
  }
  const server = express()
  server.use(express.json())
  server.use(authorizeJWT(authConfig))

  server.post('/api/messages', (req: Request, res: Response) =>
    adapter.process(req, res, (context) =>
      agent.run(context)
    )
  )

  const port = process.env.PORT || 3978
  server.listen(port, async () => {
    const version = (await import('@microsoft/agents-hosting/package.json')).version
    console.log(`\nServer listening to port ${port} on sdk ${version} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
  }).on('error', console.error)
}
