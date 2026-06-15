/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  ActivityHandler,
  AGENT_RESPONSE_ROUTE_PATH,
  CloudAdapter,
  ConversationState,
  createAgentResponseHandler,
  Request
} from '@microsoft/agents-hosting'
import { adaptReply } from './replyAdapter'

/**
 * Configures the agent response controller endpoint on a Fastify instance.
 *
 * @remarks
 * Registers `POST /api/agentresponse/v3/conversations/:conversationId/activities/:activityId`
 * using the framework-agnostic handler from `@microsoft/agents-hosting`. Mirrors the
 * Express `configureResponseController` API for parity.
 *
 * @param fastify - The Fastify instance to register the route on.
 * @param adapter - The CloudAdapter for processing activities.
 * @param agent - The ActivityHandler containing agent logic.
 * @param conversationState - The ConversationState used to look up conversation references.
 *
 * @example
 * ```typescript
 * import Fastify from 'fastify'
 * import { CloudAdapter, ConversationState, MemoryStorage } from '@microsoft/agents-hosting'
 * import { configureResponseController } from '@microsoft/agents-hosting-fastify'
 *
 * const fastify = Fastify()
 * const adapter = new CloudAdapter()
 * const conversationState = new ConversationState(new MemoryStorage())
 * configureResponseController(fastify, adapter, myAgent, conversationState)
 * ```
 */
export const configureResponseController = (
  fastify: FastifyInstance,
  adapter: CloudAdapter,
  agent: ActivityHandler,
  conversationState: ConversationState
) => {
  const handler = createAgentResponseHandler(adapter, agent, conversationState)
  fastify.post(AGENT_RESPONSE_ROUTE_PATH, async (request: FastifyRequest, reply: FastifyReply) => {
    const adaptedReq: Request = {
      method: request.method,
      headers: request.headers as Record<string, string | string[] | undefined>,
      body: (request.body ?? undefined) as Record<string, unknown> | undefined
    }
    const params = request.params as { conversationId: string, activityId: string }
    await handler(adaptedReq, adaptReply(reply), {
      conversationId: params.conversationId,
      activityId: params.activityId
    })
  })
}
