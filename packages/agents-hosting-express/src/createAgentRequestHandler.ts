/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Response } from 'express'
import { ActivityHandler, AgentApplication, AuthConfiguration, authorizeJWT, getAuthConfigWithDefaults, Request, TurnState } from '@microsoft/agents-hosting'
import { createCloudAdapter } from './createCloudAdapter'

/**
 * Minimal response interface describing the methods used by the Agent request handler.
 * Any framework whose response object satisfies this shape is compatible.
 */
export interface WebResponse {
  status (code: number): this
  setHeader (name: string, value: string): this
  send (body?: unknown): this
  end (): this
  headersSent: boolean
}

/**
 * A request handler function signature that does not import Express types in its public API.
 *
 * @remarks
 * Runtime processing still depends on the request/response behavior expected by `authorizeJWT` and `CloudAdapter.process`.
 * Use this with Express directly, or with adapter layers that provide compatible request/response objects.
 */
export type AgentRequestHandler = (req: Request, res: WebResponse) => Promise<void>

/**
 * Creates a request handler for processing Agent activities.
 *
 * This exposes a handler signature without requiring Express types in consumer code.
 * It can be used with Express directly, or with frameworks that provide adapted objects compatible with
 * the requirements of `authorizeJWT` and `CloudAdapter.process`.
 *
 * JWT authorization is applied within the handler before processing the activity.
 * Requests must provide a parsed activity payload at `req.body`.
 *
 * @param agent - The AgentApplication or ActivityHandler instance to process incoming activities.
 * @param authConfiguration - Optional custom authentication configuration. If not provided,
 * configuration will be loaded from environment variables using loadAuthConfigFromEnv().
 * @returns A request handler function `(req, res) => Promise<void>`.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { AgentApplication, TurnState } from '@microsoft/agents-hosting';
 * import { createAgentRequestHandler } from '@microsoft/agents-hosting-express';
 *
 * const agent = new AgentApplication<TurnState>();
 * const handler = createAgentRequestHandler(agent);
 *
 * const app = express();
 * app.use(express.json());
 * app.post('/api/messages', handler);
 * app.get('/health', (req, res) => res.json({ status: 'ok' }));
 * app.listen(3978);
 * ```
 */
export const createAgentRequestHandler = (
  agent: AgentApplication<TurnState<any, any>> | ActivityHandler,
  authConfiguration?: AuthConfiguration
): AgentRequestHandler => {
  const authConfig = getAuthConfigWithDefaults(authConfiguration)
  const { adapter, headerPropagation } = createCloudAdapter(agent, authConfig)
  const jwtMiddleware = authorizeJWT(authConfig)

  return async (req: Request, res: WebResponse): Promise<void> => {
    let middlewareError: any
    let nextCalled = false

    await jwtMiddleware(req, res as Response, (err?: any) => {
      nextCalled = true
      middlewareError = err
    })

    if (middlewareError) {
      throw middlewareError
    }

    // If the middleware handled the response without calling next (e.g., 401), don't process the activity.
    if (!nextCalled || res.headersSent) {
      return
    }

    await adapter.process(req, res as Response, (context) => agent.run(context), headerPropagation)
  }
}
