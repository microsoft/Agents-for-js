/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ActivityTypes, ConversationReference, ExceptionHelper } from '@microsoft/agents-activity'
import { ActivityHandler } from '../activityHandler'
import { CloudAdapter } from '../cloudAdapter'
import { Request } from '../auth/request'
import { WebResponse } from '../interfaces/webResponse'
import { TurnContext } from '../turnContext'
import { randomUUID } from 'crypto'
import { normalizeIncomingActivity } from '../activityWireCompat'
import { Errors } from '../errorHelper'
import { debug } from '@microsoft/agents-telemetry'
import { ConversationState } from '../state'

const logger = debug('agents:agent-client')

interface ConversationReferenceState {
  conversationReference: ConversationReference
}

/**
 * Route parameters supplied to {@link AgentResponseHandler} — typically pulled from
 * the framework's URL path parser.
 */
export interface AgentResponseHandlerParams {
  conversationId: string
  activityId: string
}

/**
 * Framework-agnostic handler signature for the agent response controller endpoint.
 *
 * @remarks
 * The handler is intended to be invoked by a thin framework-specific wrapper (such
 * as Express's `configureResponseController(app, ...)`) that extracts the path
 * parameters and forwards a parsed `req.body` plus an {@link WebResponse}.
 */
export type AgentResponseHandler = (
  req: Request,
  res: WebResponse,
  params: AgentResponseHandlerParams
) => Promise<void>

/**
 * Creates a framework-agnostic handler for the agent response controller endpoint.
 *
 * This is the core, Express-free implementation used by:
 * - `configureResponseController` in `@microsoft/agents-hosting-express`
 * - `configureResponseController` in `@microsoft/agents-hosting-fastify`
 *
 * Both wrappers register the canonical route
 * `POST /api/agentresponse/v3/conversations/:conversationId/activities/:activityId`
 * and forward the parsed body + path parameters to the handler returned here.
 *
 * @param adapter - The CloudAdapter used for processing activities and managing conversations.
 * @param agent - The ActivityHandler containing the agent logic.
 * @param conversationState - The ConversationState used to look up the stored conversation reference.
 * @returns A handler `(req, res, params) => Promise<void>`.
 */
export const createAgentResponseHandler = (
  adapter: CloudAdapter,
  agent: ActivityHandler,
  conversationState: ConversationState
): AgentResponseHandler => {
  return async (req: Request, res: WebResponse, params: AgentResponseHandlerParams) => {
    if (!req.body) {
      throw ExceptionHelper.generateException(TypeError, Errors.MissingRequestBody)
    }
    const incoming = normalizeIncomingActivity(req.body)
    const activity = Activity.fromObject(incoming)

    logger.debug('received response: ', activity)

    const connection = adapter.connectionManager.getDefaultConnection()
    const appId = connection?.connectionSettings?.clientId ?? ''

    const myTurnContext = new TurnContext(adapter, activity, CloudAdapter.createIdentity(appId))
    const conversationDataAccessor = conversationState.createProperty<ConversationReferenceState>(params.conversationId)
    const conversationRefState = await conversationDataAccessor.get(myTurnContext, undefined, { channelId: activity.channelId!, conversationId: params.conversationId })

    const callback = async (turnContext: TurnContext) => {
      activity.applyConversationReference(conversationRefState.conversationReference)
      turnContext.activity.id = params.activityId

      let response: unknown
      let responseContentType: string | undefined
      if (activity.type === ActivityTypes.EndOfConversation) {
        await conversationDataAccessor.delete(turnContext, { channelId: activity.channelId!, conversationId: activity.conversation!.id })

        applyActivityToTurnContext(turnContext, activity)
        await agent.run(turnContext)

        response = randomUUID().replace(/-/g, '')
        // Explicitly set the content-type so Express and Fastify both emit the same
        // value for this raw-string body (Express defaults to text/html, Fastify to
        // text/plain when the framework auto-detects).
        responseContentType = 'text/plain; charset=utf-8'
      } else {
        response = await turnContext.sendActivity(activity)
      }
      if (responseContentType !== undefined) {
        res.setHeader('content-type', responseContentType)
      }
      res.status(200).send(response)
    }

    await adapter.continueConversation(myTurnContext.identity, conversationRefState.conversationReference, callback)
  }
}

const applyActivityToTurnContext = (turnContext: TurnContext, activity: Activity) => {
  turnContext.activity.channelData = activity.channelData
  turnContext.activity.code = activity.code
  turnContext.activity.entities = activity.entities
  turnContext.activity.locale = activity.locale
  turnContext.activity.localTimestamp = activity.localTimestamp
  turnContext.activity.name = activity.name
  turnContext.activity.relatesTo = activity.relatesTo
  turnContext.activity.replyToId = activity.replyToId
  turnContext.activity.timestamp = activity.timestamp
  turnContext.activity.text = activity.text
  turnContext.activity.type = activity.type
  turnContext.activity.value = activity.value
}

/**
 * Canonical route path for the agent response controller endpoint.
 * Both Express and Fastify wrappers should register on this path.
 */
export const AGENT_RESPONSE_ROUTE_PATH = '/api/agentresponse/v3/conversations/:conversationId/activities/:activityId'
