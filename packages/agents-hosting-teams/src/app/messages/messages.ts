/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ActivityTypes, Channels } from '@microsoft/agents-activity'
import { INVOKE_RESPONSE_KEY, InvokeResponse, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsApplication } from '../teamsApplication'
import { TaskModuleTaskInfo } from '../../task/taskModuleTaskInfo'
import { TaskModuleResponse } from '../../task/taskModuleResponse'
import { MessageInvokeNames } from './messageInvokeNames'

/**
 * Handles message-related operations for Teams applications.
 * Provides methods for handling message fetch operations.
 * @template TState Type extending TurnState to be used by the application
 */
export class Messages<TState extends TurnState> {
  private readonly _app: TeamsApplication<TState>

  /**
   * Creates a new Messages instance.
   * @param app The TeamsApplication instance to associate with this Messages instance
   */
  public constructor (app: TeamsApplication<TState>) {
    this._app = app
  }

  /**
   * Handles fetch requests for messages in Teams, which typically occur when
   * a message action is invoked.
   *
   * @template TData Type of data expected in the message fetch request
   * @param handler Function to handle the message fetch request
   * @returns The TeamsApplication instance for chaining
   */
  public fetch<TData extends Record<string, any> = Record<string, any>>(
    handler: (context: TurnContext, state: TState, data: TData) => Promise<TaskModuleTaskInfo | string>
  ): TeamsApplication<TState> {
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

            await context.sendActivity({
              value: { body: response, status: 200 } as InvokeResponse,
              type: ActivityTypes.InvokeResponse
            } as Activity)
          }
        }
      },
      true
    )

    return this._app
  }
}
