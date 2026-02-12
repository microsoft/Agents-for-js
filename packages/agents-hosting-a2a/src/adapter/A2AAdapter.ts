/**
 * Agents SDK adapter for adding A2A protocol support
 */

/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseAdapter, TurnContext, Storage, AttachmentData, AttachmentInfo, Request, ResourceResponse } from '@microsoft/agents-hosting'
import { Activity, ConversationReference, RoleTypes } from '@microsoft/agents-activity'
import { Response, RequestHandler, Request as ExpressRequest, NextFunction } from 'express'
import { debug } from '@microsoft/agents-activity/logger'
import { v4 as uuidv4 } from 'uuid'
import { JwtPayload } from 'jsonwebtoken'

// Import types only with resolution-mode for CommonJS
import type { A2ARequestHandler, TaskStore, ExecutionEventBus, RequestContext, User } from '@a2a-js/sdk/server' with { 'resolution-mode': 'require' }
import type { UserBuilder } from '@a2a-js/sdk/server/express' with { 'resolution-mode': 'require' }
import type { AgentCard, Message, Extensions, Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from '@a2a-js/sdk' with { 'resolution-mode': 'require' }

const { DefaultRequestHandler } = require('@a2a-js/sdk/server')
const { restHandler, jsonRpcHandler } = require('@a2a-js/sdk/server/express')

const logger = debug('agents:a2a-adapter')

class A2AExecutor {
  private runningTask: Set<string> = new Set()
  private lastContextId: string | null = null

  constructor (private adapter: A2AAdapter) {

  }

  async execute (requestContext: RequestContext, eventBus: ExecutionEventBus) {
    const { taskId, contextId, userMessage, task } = requestContext
    console.log('[Executor] Executing task:', taskId, 'in context:', contextId)
    this.lastContextId = contextId
    this.runningTask.add(taskId)

    // // 1. Create and publish the initial task object if it doesn't exist.
    if (!task) {
      const initialTask: Task = {
        kind: 'task',
        id: taskId,
        contextId,
        status: {
          state: 'submitted',
          timestamp: new Date().toISOString(),
        },
        history: [userMessage],
      }
      eventBus.publish(initialTask)
    }

    // Create an activity and turn context
    let identity // get this from the UserBuilder somehow??
    if (requestContext.context?.user?.isAuthenticated) {
      // somehow construct a jwt payload for this user
      const user = requestContext.context.user as AgentsA2AUser
      identity = user.identity
    }
    const activity = Activity.fromObject({
      type: 'message',
      id: uuidv4(),
      channelId: 'A2A',
      conversation: { id: taskId },
      recipient: { role: RoleTypes.User, id: 'user' },
      from: { role: RoleTypes.Agent, id: 'agent' },
      text: userMessage.parts.map((part: any) => part.text).join('\n'),
      channelData: {
        taskId, contextId
      }
    })

    const turnContext = new TurnContext(this.adapter, activity, identity)
    turnContext.turnState.set('A2AExecutionEventBus', eventBus)

    // Run the adapter logic
    await this.adapter.logic(turnContext)

    if (!this.runningTask.has(taskId)) {
      logger.info(
        `[SUTAgentExecutor] Task ${taskId} was cancelled before processing could complete.`
      )
      return
    }

    // 3. Publish the final status and mark the event as 'final'.
    const finalUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId,
      status: { state: 'completed', timestamp: new Date().toISOString() },
      final: true,
    }
    eventBus.publish(finalUpdate)
    eventBus.finished()
  }

  public cancelTask = async (taskId: string, eventBus: ExecutionEventBus): Promise<void> => {
    this.runningTask.delete(taskId)
    const cancelledUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId: this.lastContextId ?? uuidv4(),
      status: {
        state: 'canceled',
        timestamp: new Date().toISOString(),
      },
      final: true, // Cancellation is a final state
    }
    eventBus.publish(cancelledUpdate)
  }
}

/* TaskStore implementation that uses the Agents Hosting Storage interface for persistence.
 * Wraps the Agents SDK storage class with the A2A get/set
*/
export class AgentsTaskStore implements TaskStore {
  constructor (private storage: Storage) {

  }

  makeKeyFromTaskId (taskId: string): string {
    return `task-${taskId}`
  }

  async load (taskId: string): Promise<Task | undefined> {
    const key = this.makeKeyFromTaskId(taskId)
    const entry = await this.storage.read([key])
    if (entry[key]) {
      return entry[key] as Task
    }
    return undefined
  }

  async save (task: Task): Promise<void> {
    const key = this.makeKeyFromTaskId(task.id)
    // Store copies to prevent internal mutation if caller reuses objects
    const update = {
      [key]: JSON.parse(JSON.stringify(task))
    }
    await this.storage.write(update)
  }
}

export type AgentsA2AUser = User & {
  identity: JwtPayload | undefined
}

/**
 * Adapter for handling agent interactions with various channels thgh cloud-based services.
 *
 * @remarks
 * CloudAdapter processes incoming HTTP requests from A2A clients, validates and
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
    // todo : implement
    logger.debug('A2A Adapter initialized')

    this._logic = logic

    this._requestHandler = new DefaultRequestHandler(
      agentCard,
      new AgentsTaskStore(storage),
      new A2AExecutor(this)
    )

    const userBuilder: UserBuilder = async (request: Request): Promise<AgentsA2AUser> => {
      if (request.user) {
        console.log('GETTING TOKEN FROM REQUEST INSIDE USERBUILDER!', request.user)
        // if (request.headers['authorization']) {
        // In a real implementation, you would validate the token and extract user info here
        // const jwtString = request.headers['authorization'].split(' ')[1] // Assuming "Bearer <token>"
        // logger.debug('Received JWT token:', jwtString)
        // const payload = jwt.decode(jwtString) as JwtPayload

        // todo: validate the signature and claims of the JWT token to ensure it's from a trusted source and not expired

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
        const hasStreamingEntity = activity.entities?.some((entity) => entity.type === 'streaminfo')
        if (activity.type === 'message') {
          // TODO:
          // the message version below works nicely with the a2a inspector
          // however does not work with MCS
          // const message: Message = {
          //   kind: 'message',
          //   messageId: activity.id || uuidv4(),
          //   role: 'agent',
          //   parts: [{ kind: 'text', text: activity.text || '' }],
          //   contextId: context.activity.channelData?.contextId || uuidv4(),
          //   taskId: context.activity.conversation?.id,
          // }

          // this version works with MCS but not the a2a inspector
          const message: TaskStatusUpdateEvent = {
            kind: 'status-update',
            taskId: context.activity.conversation?.id!,
            contextId: context.activity.channelData?.contextId || uuidv4(),
            final: false,
            status: {
              state: 'input-required',
              message: {
                role: 'agent',
                parts: [{ kind: 'text', text: activity.text || '' }],
                messageId: activity.id || uuidv4(),
                contextId: context.activity.channelData?.contextId || uuidv4(),
                taskId: context.activity.conversation?.id,
                kind: 'message',
              }
            }
          }
          console.log('OUTBOUND A2A MESSAGE:', JSON.stringify(message, null, 2))
          eventBus.publish(message)
        } else if (activity.type === 'typing' && hasStreamingEntity) {
          const typingIndicator: TaskArtifactUpdateEvent = {
            kind: 'artifact-update',
            contextId: context.activity.channelData?.contextId,
            taskId: context.activity.conversation?.id!,
            artifact: {
              artifactId: context.activity.channelData?.contextId,
              parts: [{ kind: 'text', text: activity.text || 'typing...' }],
            },
          }
          eventBus.publish(typingIndicator)
        } else {
          console.log('UNHANDLED ACTIVITY', activity)
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
    // todo : implement

    logger.debug('Processing A2A request...')
    logger.debug('REQUEST BODY', request.body)

    this._jsonHandler(request as ExpressRequest, res, next)

    // const handler = new JsonRpcTransportHandler(this._requestHandler)
    // const context = new ServerCallContext(
    //   Extensions.parseServiceParameter(request.headers[HTTP_EXTENSION_HEADER] as string),
    //   { isAuthenticated: false, userName: '' }
    // )
    // const rpcResponseOrStream = handler.handle(request.body, context)

    // res.status(200).json(rpcResponseOrStream)
  }

  public async processRest (
    request: Request,
    res: Response,
    next: NextFunction,
    logic: (context: TurnContext) => Promise<void>): Promise<void> {
    // todo : implement

    logger.debug('Processing A2A REST request...')
    logger.debug('REQUEST BODY', request.body)

    this._restHandler(request as ExpressRequest, res, next)
  }

  public async handleCardRequest (req: Request, res: Response): Promise<void> {
    // logger.debug(this._requestHandler.getAgentCard())
    res.json(await this._requestHandler.getAgentCard())
  }
}
