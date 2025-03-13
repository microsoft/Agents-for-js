/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ActivityTypes, Channels, INVOKE_RESPONSE_KEY, InvokeResponse, TurnContext, TurnState } from '@microsoft/agents-bot-hosting'
import { TeamsApplication } from './teamsApplication'
import { TaskModuleTaskInfo } from '../task/taskModuleTaskInfo'
import { TaskModuleResponse } from '../task/taskModuleResponse'
import { MessageInvokeNames } from './messageInvokeNames'

export class Messages<TState extends TurnState> {
  private readonly _app: TeamsApplication<TState>

  public constructor (app: TeamsApplication<TState>) {
    this._app = app
  }

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
