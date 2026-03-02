/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext, } from '@microsoft/agents-hosting'
import { v4 as uuidv4 } from 'uuid'
import { JwtPayload } from 'jsonwebtoken'
import { debug } from '@microsoft/agents-activity/logger'

// Import types only with resolution-mode for CommonJS
import type { ExecutionEventBus, RequestContext, User } from '@a2a-js/sdk/server' with { 'resolution-mode': 'require' }
import type { Task, TaskStatusUpdateEvent } from '@a2a-js/sdk' with { 'resolution-mode': 'require' }

import { A2AAdapter } from './A2AAdapter'
import { a2aMessageToActivity } from './A2AActivity'
const logger = debug('agents:a2a-adapter:executor')

export type AgentsA2AUser = User & {
  identity: JwtPayload | undefined
}

export class A2AExecutor {
  private runningTask: Set<string> = new Set()
  private lastContextId: string | null = null

  constructor (private adapter: A2AAdapter) {

  }

  async execute (requestContext: RequestContext, eventBus: ExecutionEventBus) {
    const { taskId, contextId, userMessage, task } = requestContext
    logger.debug('Executing task:', taskId, 'in context:', contextId)
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
    let identity

    // this gets the results of our "UserBuilder" that plucks the jwt identity off the request
    if (requestContext.context?.user?.isAuthenticated) {
      const user = requestContext.context.user as AgentsA2AUser
      identity = user.identity
    }

    const activity = a2aMessageToActivity(requestContext)
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
