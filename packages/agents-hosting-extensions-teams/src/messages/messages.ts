/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ActivityTypes, Channels } from '@microsoft/agents-activity'
import { AgentApplication, INVOKE_RESPONSE_KEY, InvokeResponse, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TaskModuleResponse, TaskModuleTaskInfo } from '../taskModule'

/**
 * Enum representing the names of message invoke actions.
 *
 * This enum is used to define the specific invoke actions that can be triggered
 * in the context of message handling.
 */
export enum MessageInvokeNames {
  /**
   * Represents the action to fetch a task associated with a message.
   */
  FETCH_INVOKE_NAME = 'message/fetchTask'
}

/**
 * Handles message-related operations for Teams applications.
 * Provides methods for handling message fetch operations.
 * @typeParam TState Type extending TurnState to be used by the application
 */
export class Messages<TState extends TurnState> {
  private readonly _app: AgentApplication<TState>

  /**
   * Creates a new Messages instance.
   * @param app The TeamsApplication instance to associate with this Messages instance
   */
  public constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  /**
   * Handles fetch requests for messages in Teams, which typically occur when
   * a message action is invoked.
   *
   * @typeParam TData Type of data expected in the message fetch request
   * @param handler Function to handle the message fetch request
   * @returns The TeamsApplication instance for chaining
   */
  public fetch<TData extends Record<string, any> = Record<string, any>>(
    handler: (context: TurnContext, state: TState, data: TData) => Promise<TaskModuleTaskInfo | string>
  ): AgentApplication<TState> {
    this._app.addRoute(
      async (context) => {
        return (
          context?.activity?.type === ActivityTypes.Invoke &&
                    context?.activity?.name === MessageInvokeNames.FETCH_INVOKE_NAME
        )
      },
      async (context, state) => {
        if (context?.activity?.channelId === Channels.Msteams) {
          const result = await handler(context, state, (context.activity.value as TData)?.data ?? {} as TData)

          if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
            let response: TaskModuleResponse
            if (typeof result === 'string') {
              response = {
                task: {
                  type: 'message',
                  value: result
                }
              }
            } else {
              response = {
                task: {
                  type: 'continue',
                  value: result
                }
              }
            }

            await context.sendActivity(Activity.fromObject({
              value: { body: response, status: 200 } as InvokeResponse,
              type: ActivityTypes.InvokeResponse
            }))
          }
        }
      },
      true
    )

    return this._app
  }
}
