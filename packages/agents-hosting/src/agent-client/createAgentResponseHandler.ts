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
import { getAuthorizedAudience } from '../auth/jwt-middleware'

const logger = debug('agents:agent-client')

interface ConversationReferenceState {
  conversationReference: ConversationReference
  expectedAgentClientId?: string
}

interface DelegatedConversationState {
  conversationReference: ConversationReference
  expectedAgentClientId: string
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
  const appId = adapter.getClientId() ?? ''
  const anonymousDevelopment = appId.length === 0 && process.env.NODE_ENV !== 'production'
  if (anonymousDevelopment) {
    emitAgentResponseWarning(
      'The agent-response endpoint is using anonymous authentication outside production. Callback ownership cannot be cryptographically verified; configure a client ID before deployment.'
    )
  }

  return async (req: Request, res: WebResponse, params: AgentResponseHandlerParams) => {
    let middlewareError: any
    let nextCalled = false
    await adapter.authorizeRequest(req, res, (err?: any) => {
      nextCalled = true
      middlewareError = err
    })
    if (middlewareError) {
      throw middlewareError
    }
    if (!nextCalled || res.headersSent) {
      return
    }

    if (!req.body) {
      throw ExceptionHelper.generateException(TypeError, Errors.MissingRequestBody)
    }
    const incoming = normalizeIncomingActivity(req.body)
    const activity = Activity.fromObject(incoming)

    logger.debug('received delegated agent response')

    const continuationAudience = getAuthorizedAudience(req) ?? appId
    const myTurnContext = new TurnContext(adapter, activity, CloudAdapter.createIdentity(continuationAudience))
    const conversationDataAccessor = conversationState.createProperty<ConversationReferenceState>(params.conversationId)
    const incomingChannelId = activity.channelId!
    const conversationRefState = await conversationDataAccessor.get(myTurnContext, undefined, { channelId: incomingChannelId, conversationId: params.conversationId })
    if (!isDelegatedConversationState(conversationRefState)) {
      res.status(403).send({ 'agent-response-auth-error': 'caller is not authorized for this conversation' })
      return
    }

    const callerClientId = req.user?.azp ?? req.user?.appid
    const anonymousCaller = anonymousDevelopment && req.user?.name === 'anonymous'
    const delegatedAgentMatches = anonymousCaller || (
      typeof callerClientId === 'string' &&
      callerClientId.length > 0 &&
      callerClientId.toLowerCase() === conversationRefState.expectedAgentClientId.toLowerCase()
    )
    if (!delegatedAgentMatches) {
      res.status(403).send({ 'agent-response-auth-error': 'caller is not authorized for this conversation' })
      return
    }

    const callback = async (turnContext: TurnContext) => {
      activity.applyConversationReference(conversationRefState.conversationReference)
      turnContext.activity.id = params.activityId

      let response: unknown
      let responseContentType: string | undefined
      if (activity.type === ActivityTypes.EndOfConversation) {
        await conversationState.delete(myTurnContext, { channelId: incomingChannelId, conversationId: params.conversationId })

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

function isDelegatedConversationState (state: ConversationReferenceState | undefined): state is DelegatedConversationState {
  return typeof state?.conversationReference === 'object' &&
    state.conversationReference !== null &&
    typeof state.expectedAgentClientId === 'string' &&
    state.expectedAgentClientId.trim().length > 0
}

function emitAgentResponseWarning (message: string): void {
  console.warn(`[agents:agent-client] ${message}`)
  logger.warn(message)
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
