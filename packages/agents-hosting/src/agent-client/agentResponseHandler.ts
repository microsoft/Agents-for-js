/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActivityHandler } from '../activityHandler'
import { CloudAdapter } from '../cloudAdapter'
import { ConversationState } from '../state'
import { WebRequestParamsCarrier, WebResponse } from '../interfaces/webResponse'
import { Request } from '../auth/request'
import { AGENT_RESPONSE_ROUTE_PATH, createAgentResponseHandler } from './createAgentResponseHandler'

/**
 * Minimal application surface needed by {@link configureResponseController} to
 * register the SDK-specific Activity callback POST route. Express's `Application`
 * structurally satisfies this. Framework integrations that do not satisfy it
 * should wrap {@link createAgentResponseHandler}; Fastify users should use
 * `configureResponseController` from `@microsoft/agents-hosting-fastify`.
 *
 * `WebApp` is a minimal structural shape rather than a richer, named
 * route-registrar contract. It is exported so it has a stable name in the
 * generated type declarations and API report (it appears in the exported
 * {@link configureResponseController} signature). Any framework `app` whose
 * `post(path, handler)` method structurally matches satisfies it.
 */
export interface WebApp {
  post (
    path: string,
    handler: (req: any, res: any) => unknown | Promise<unknown>
  ): unknown
}

/**
 * Registers the authenticated Activity callback endpoint used by SDK-specific
 * Activity-protocol delegation.
 *
 * @remarks
 * This endpoint is part of the Microsoft Agents SDK delegated-agent callback
 * flow
 *
 * The endpoint expects activities to be sent to:
 * `POST /api/agentresponse/v3/conversations/{conversationId}/activities/{activityId}`
 *
 * The function handles:
 * - Returning `401` when JWT authentication fails
 * - Returning `403` when delegated state is invalid or the authenticated caller
 *   does not own the delegated conversation
 * - Normalizing incoming activity data from the request body
 * - Retrieving conversation references from conversation state
 * - Continuing conversations using the stored conversation reference
 * - Processing EndOfConversation activities by cleaning up conversation state
 * - Sending activities through the turn context and returning responses
 *
 * Anonymous callbacks are supported only for unconfigured development hosts
 * outside production and cannot cryptographically prove callback ownership.
 *
 * @param app - The application instance (Express `Application` or any framework that satisfies {@link WebApp}) to configure the route on.
 * @param adapter - The CloudAdapter instance used for processing bot framework activities and managing conversations.
 * @param agent - The ActivityHandler instance that contains the bot's logic for processing different types of activities.
 * @param conversationState - The ConversationState instance used for managing conversation-specific state and conversation references.
 *
 * @example
 * ```typescript
 * const app = express();
 * const adapter = new CloudAdapter();
 * const agent = new MyActivityHandler();
 * const conversationState = new ConversationState(memoryStorage);
 *
 * configureResponseController(app, adapter, agent, conversationState);
 * ```
 */
export const configureResponseController = (
  app: WebApp,
  adapter: CloudAdapter,
  agent: ActivityHandler,
  conversationState: ConversationState
) => {
  const handler = createAgentResponseHandler(adapter, agent, conversationState)
  app.post(AGENT_RESPONSE_ROUTE_PATH, async (req: Request & WebRequestParamsCarrier, res: WebResponse) => {
    await handler(req, res, {
      conversationId: req.params!.conversationId as string,
      activityId: req.params!.activityId as string
    })
  })
}
