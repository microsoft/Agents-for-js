// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import type { TaskModuleRequest, TaskModuleResponse } from '@microsoft/teams.api'
import { TeamsTurnContext } from '../teamsTurnContext'

const DEFAULT_TASK_DATA_KEY = 'task'

function matchesTaskKeyValue (context: TurnContext, value: string | RegExp, key: string): boolean {
  const taskData = (context.activity.value as any)?.data
  if (!taskData || typeof taskData !== 'object') return false
  const dataValue = taskData[normalizeTaskDataKey(key)]
  if (typeof dataValue !== 'string') return false
  return typeof value === 'string' ? dataValue === value : value.test(dataValue)
}

function isTaskInvoke (context: TurnContext, name: string): boolean {
  return (
    context.activity.type === ActivityTypes.Invoke &&
    context.activity.channelId === 'msteams' &&
    context.activity.name === name &&
    context.activity.value != null
  )
}

function normalizeTaskDataKey (key: string): string {
  return key.trim() || DEFAULT_TASK_DATA_KEY
}

function matchesTaskInvoke (context: TurnContext, name: string, value: string | RegExp | null, key: string): boolean {
  if (!isTaskInvoke(context, name)) {
    return false
  }

  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return true
  }

  return matchesTaskKeyValue(context, value, key)
}

type FetchHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, request: TaskModuleRequest) => Promise<TaskModuleResponse>
type SubmitHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, request: TaskModuleRequest) => Promise<TaskModuleResponse>

/**
 * Registers handlers for Microsoft Teams task module invoke activities.
 *
 * @typeParam TState - The turn state type used by the agent application.
 */
export class TaskModule<TState extends TurnState> {
  _app: AgentApplication<TState>

  /**
   * Creates a Teams task module route helper.
   *
   * @param app - The agent application that receives the registered routes.
   */
  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  /**
   * Registers a handler for Teams task/fetch invokes.
   *
   * @param value - Optional task data value or regular expression used to match the invoke.
   * @param handler - Handler invoked with the task module request.
   * @param key - Task data key to inspect when matching `value`. Defaults to `task`.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This task module helper for chaining.
   */
  onFetch (value: string | RegExp | null, handler: FetchHandler<TState>, key: string = DEFAULT_TASK_DATA_KEY, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(matchesTaskInvoke(context, 'task/fetch', value, key))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const request = context.activity.value as TaskModuleRequest
      const response: TaskModuleResponse = await handler(new TeamsTurnContext(context), state, request)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams task/submit invokes.
   *
   * @param value - Optional task data value or regular expression used to match the invoke.
   * @param handler - Handler invoked with the task module request.
   * @param key - Task data key to inspect when matching `value`. Defaults to `task`.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This task module helper for chaining.
   */
  onSubmit (value: string | RegExp | null, handler: SubmitHandler<TState>, key: string = DEFAULT_TASK_DATA_KEY, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(matchesTaskInvoke(context, 'task/submit', value, key))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const request = context.activity.value as TaskModuleRequest
      const response: TaskModuleResponse = await handler(new TeamsTurnContext(context), state, request)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }
}
