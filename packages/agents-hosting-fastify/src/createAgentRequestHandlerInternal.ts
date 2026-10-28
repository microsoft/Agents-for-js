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
  createCloudAdapter,
  getAuthConfigWithDefaults,
  Request,
  TurnState,
  type CloudAdapterResult,
  type CreateCloudAdapterOptions
} from '@microsoft/agents-hosting'
import { adaptReply } from './replyAdapter'

type FastifyAgentRequestHandler = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void>

interface FastifyAgentRequestHandlerSetup extends CloudAdapterResult {
  authConfig: AuthConfiguration
  handler: FastifyAgentRequestHandler
}

export function createAgentRequestHandlerInternal (
  agent: AgentApplication<TurnState<any, any>> | ActivityHandler,
  authConfiguration?: AuthConfiguration,
  options?: CreateCloudAdapterOptions
): FastifyAgentRequestHandlerSetup {
  const configurationContext = options?.configurationContext ??
    (agent instanceof AgentApplication ? agent.options.configurationContext : undefined)
  const authConfig = getAuthConfigWithDefaults(authConfiguration, { configurationContext })
  const jwtMiddleware = authorizeJWT(authConfig)
  const { adapter, headerPropagation } = createCloudAdapter(agent, authConfig, options)

  return {
    adapter,
    authConfig,
    headerPropagation,
    handler: async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
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
    }
  }
}
