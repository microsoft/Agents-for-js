// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import type { TaskModuleRequest, TaskModuleResponse } from '@microsoft/teams.api'

const DEFAULT_TASK_DATA_KEY = 'task'

function matchesTaskKeyValue (context: TurnContext, value: string | RegExp, key: string): boolean {
  const taskData = (context.activity.value as any)?.data
  if (!taskData || typeof taskData !== 'object') return false
  const dataValue = taskData[key]
  if (typeof dataValue !== 'string') return false
  return typeof value === 'string' ? dataValue === value : value.test(dataValue)
}

type FetchHandler<TState extends TurnState> = (context: TurnContext, state: TState, request: TaskModuleRequest) => Promise<TaskModuleResponse>
type SubmitHandler<TState extends TurnState> = (context: TurnContext, state: TState, request: TaskModuleRequest) => Promise<TaskModuleResponse>

export class TaskModule<TState extends TurnState> {
  _app: AgentApplication<TState>

  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  onFetch (value: string | RegExp, handler: FetchHandler<TState>, key: string = DEFAULT_TASK_DATA_KEY, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'task/fetch' &&
        matchesTaskKeyValue(context, value, key)
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const request = context.activity.value as TaskModuleRequest
      const response: TaskModuleResponse = await handler(context, state, request)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  onSubmit (value: string | RegExp | null, handler: SubmitHandler<TState>, key: string = DEFAULT_TASK_DATA_KEY, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      if (value === null) {
        return Promise.resolve(
          context.activity.type === ActivityTypes.Invoke &&
          context.activity.channelId === 'msteams' &&
          context.activity.name === 'task/submit'
        )
      }
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'task/submit' &&
        matchesTaskKeyValue(context, value, key)
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const request = context.activity.value as TaskModuleRequest
      const response: TaskModuleResponse = await handler(context, state, request)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }
}
