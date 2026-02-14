/**
 * Agents SDK adapter for adding A2A protocol support
 */

/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseAdapter, TurnContext, Storage, AttachmentData, AttachmentInfo, Request, ResourceResponse } from '@microsoft/agents-hosting'
import { Activity, ConversationReference } from '@microsoft/agents-activity'
import { Response, RequestHandler, NextFunction } from 'express'
import { debug } from '@microsoft/agents-activity/logger'
import { JwtPayload } from 'jsonwebtoken'

// Import types only with resolution-mode for CommonJS
import type { A2ARequestHandler, ExecutionEventBus } from '@a2a-js/sdk/server' with { 'resolution-mode': 'require' }
import type { UserBuilder } from '@a2a-js/sdk/server/express' with { 'resolution-mode': 'require' }
import type { AgentCard } from '@a2a-js/sdk' with { 'resolution-mode': 'require' }

import { A2AExecutor, AgentsA2AUser } from './A2AExecutor'
import { A2ATaskStore } from './A2ATaskStore'
import { activityToA2AMessage } from './A2AActivity'

const { DefaultRequestHandler } = require('@a2a-js/sdk/server')
const { restHandler, jsonRpcHandler } = require('@a2a-js/sdk/server/express')

const logger = debug('agents:a2a-adapter')

/**
 * Adapter for handling agent interactions with various channels thgh cloud-based services.
 *
 * @remarks
 * A2AAdapter processes incoming HTTP requests from A2A clients, validates and
 * authenticates them, and generates outgoing responses. It manages the communication
 * flow between agents and users across different channels, handling activities, attachments,
 * and conversation continuations.
 */
export class A2AAdapter extends BaseAdapter {
  private _requestHandler: A2ARequestHandler
  private _jsonHandler: RequestHandler
  private _restHandler: RequestHandler
  private _logic: (context: TurnContext) => Promise<void>
  constructor (agentCard: AgentCard, logic: (context: TurnContext) => Promise<void>, storage: Storage) {
    super()
    logger.debug('A2A Adapter initialized')

    // Store the logic function, which gets called to process incoming turns
    this._logic = logic

    // Create an A2A request handler that will be used to service incoming requets.
    // This takes the agent card, provided by the user...
    // A task store, which we create inside the Storage provider...
    // And an executor, which is effectively the turn handler. This gets a reference to the adapter, so it can call the logic.
    this._requestHandler = new DefaultRequestHandler(
      agentCard,
      new A2ATaskStore(storage),
      new A2AExecutor(this)
    )

    // TODO: this currently supports no auth OR auth, leaving the developer to reject unauthorized requests if so desired
    // In the future, we may want to make this configurable - IE if auth is required, reject the request if not authenticated
    const userBuilder: UserBuilder = async (request: Request): Promise<AgentsA2AUser> => {
      // Assuming that jwtMiddleware has already processed the token and attached the user info to the request object
      if (request.user) {
        return {
          isAuthenticated: true,
          identity: request.user,
          userName: request.user.name || request.user.preferred_username || 'unknown',
        }
      }

      return {
        isAuthenticated: false,
        identity: undefined,
        userName: '',
      }
    }

    this._jsonHandler = jsonRpcHandler({
      requestHandler: this._requestHandler,
      userBuilder
    })

    this._restHandler = restHandler({
      requestHandler: this._requestHandler,
      userBuilder
    })
  }

  get logic (): (context: TurnContext) => Promise<void> {
    return this._logic
  }

  get jsonHandler (): RequestHandler {
    return this._jsonHandler
  }

  get restHandler (): RequestHandler {
    return this._restHandler
  }

  /**
     * Sends multiple activities to the conversation.
     * @param context - The TurnContext for the current turn.
     * @param activities - The activities to send.
     * @returns A promise representing the array of ResourceResponses for the sent activities.
     */
  async sendActivities (context: TurnContext, activities: Activity[]): Promise<ResourceResponse[]> {
    // todo : implement

    const eventBus = context.turnState.get<ExecutionEventBus>('A2AExecutionEventBus')
    if (eventBus) {
      for (const activity of activities) {
        try {
          // convert activity object to a2a format
          const message = activityToA2AMessage(context, activity)

          logger.debug('OUTBOUND A2A MESSAGE:', JSON.stringify(message, null, 2))
          eventBus.publish(message)
        } catch (err) {
          // TODO: this currently silently ignores problems with A2A translation
          // so if you try to send something that is not a typing or a message, it will just be dropped with a warning
          if (err instanceof Error) {
            logger.warn(err.message)
          }
        }
      }
    } else {
      logger.error('No A2AExecutionEventBus found in TurnState.')
    }
    return []
  }

  async updateActivity (context: TurnContext, activity: Activity): Promise<ResourceResponse | void> {
    throw new Error('Method not implemented.')
  }

  async deleteActivity (context: TurnContext, reference: Partial<ConversationReference>): Promise<void> {
    throw new Error('Method not implemented.')
  }

  async uploadAttachment (context: TurnContext, conversationId: string, attachmentData: AttachmentData): Promise<ResourceResponse> {
    throw new Error('Method not implemented.')
  }

  async getAttachmentInfo (context: TurnContext, attachmentId: string): Promise<AttachmentInfo> {
    throw new Error('Method not implemented.')
  }

  async getAttachment (context: TurnContext, attachmentId: string, viewId: string): Promise<NodeJS.ReadableStream> {
    throw new Error('Method not implemented.')
  }

  async continueConversation (
    botAppIdOrIdentity: string | JwtPayload,
    reference: ConversationReference,
    logic: (revocableContext: TurnContext) => Promise<void>,
    isResponse: Boolean = false): Promise<void> {
    throw new Error('Method not implemented.')
  }

  /**
       * Processes an incoming request and sends the response.
       * @param request - The incoming request.
       * @param res - The response to send.
       * @param logic - The logic to execute.
       * @param headerPropagation - Optional function to handle header propagation.
       */
  public async process (
    request: Request,
    res: Response,
    next: NextFunction,
    logic: (context: TurnContext) => Promise<void>): Promise<void> {
    throw new Error('Method not implemented. Pass logic to constructor instead.')
  }

  public async handleCardRequest (req: Request, res: Response): Promise<void> {
    res.json(await this._requestHandler.getAgentCard())
  }
}
