/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ActivityTypes, Channels } from '@microsoft/agents-activity'
import { INVOKE_RESPONSE_KEY, InvokeResponse, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { ConfigResponse } from '../../agent-config/configResponse'
import { TeamsApplication } from '../teamsApplication'
import { AgentConfigAuth } from '../../agent-config/agentConfigAuth'
import { TaskModuleResponse } from '../../task/taskModuleResponse'
import { TaskModuleTaskInfo } from '../../task/taskModuleTaskInfo'
import { TaskModuleInvokeNames } from './taskModuleInvokeNames'

/**
 * Manages task modules for Teams applications, handling fetch and submit operations.
 * @template TState Type extending TurnState to be used by the application
 */
export class TaskModules<TState extends TurnState> {
  private readonly _app: TeamsApplication<TState>

  /**
   * Creates a new TaskModules instance.
   * @param app The TeamsApplication instance to associate with this TaskModules instance
   */
  public constructor (app: TeamsApplication<TState>) {
    this._app = app
  }

  /**
   * Handles task module fetch requests, which occur when a task module is initially requested.
   * @template TData Type of data expected in the task module request
   * @param verb Identifier for the task module (string, RegExp, or RouteSelector)
   * @param handler Function to handle the task module fetch request
   * @returns The TeamsApplication instance for chaining
   */
  public fetch<TData extends Record<string, any> = Record<string, any>>(
    verb: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState, data: TData) => Promise<TaskModuleTaskInfo | string>
  ): TeamsApplication<TState> {
    (Array.isArray(verb) ? verb : [verb]).forEach((v) => {
      const { DEFAULT_TASK_DATA_FILTER, FETCH_INVOKE_NAME } = TaskModuleInvokeNames
      const filterField = this._app.teamsOptions.taskModules?.taskDataFilter ?? DEFAULT_TASK_DATA_FILTER
      const selector = createTaskSelector(v, filterField, FETCH_INVOKE_NAME)
      this._app.addRoute(
        selector,
        async (context, state) => {
          if (context?.activity?.channelId === Channels.Msteams) {
            if (
              context?.activity?.type !== ActivityTypes.Invoke ||
                            context?.activity?.name !== FETCH_INVOKE_NAME
            ) {
              throw new Error(
                                `Unexpected TaskModules.fetch() triggered for activity type: ${context?.activity?.type}`
              )
            }

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
    })
    return this._app
  }

  /**
   * Handles task module submit requests, which occur when a task module form is submitted.
   * @template TData Type of data expected in the task module submit request
   * @param verb Identifier for the task module (string, RegExp, or RouteSelector)
   * @param handler Function to handle the task module submit request
   * @returns The TeamsApplication instance for chaining
   */
  public submit<TData extends Record<string, any> = Record<string, any>>(
    verb: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (
      context: TurnContext,
      state: TState,
      data: TData
    ) => Promise<TaskModuleTaskInfo | string | null | undefined>
  ): TeamsApplication<TState> {
    (Array.isArray(verb) ? verb : [verb]).forEach((v) => {
      const { DEFAULT_TASK_DATA_FILTER, SUBMIT_INVOKE_NAME } = TaskModuleInvokeNames
      const filterField = this._app.teamsOptions.taskModules?.taskDataFilter ?? DEFAULT_TASK_DATA_FILTER
      const selector = createTaskSelector(v, filterField, SUBMIT_INVOKE_NAME)
      this._app.addRoute(
        selector,
        async (context, state) => {
          if (context?.activity?.channelId === Channels.Msteams) {
            if (
              context?.activity?.type !== ActivityTypes.Invoke ||
                            context?.activity?.name !== SUBMIT_INVOKE_NAME
            ) {
              throw new Error(
                                `Unexpected TaskModules.submit() triggered for activity type: ${context?.activity?.type}`
              )
            }

            const result = await handler(context, state, (context.activity.value as TData)?.data ?? {} as TData)

            if (!result) {
              await context.sendActivity({
                value: { status: 200 } as InvokeResponse,
                type: ActivityTypes.InvokeResponse
              } as Activity)
            }
            if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
              let response: TaskModuleResponse | undefined
              if (typeof result === 'string') {
                response = {
                  task: {
                    type: 'message',
                    value: result
                  }
                }
              } else if (typeof result === 'object') {
                response = {
                  task: {
                    type: 'continue',
                    value: result as TaskModuleTaskInfo
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
    })
    return this._app
  }

  /**
   * Handles configuration fetch requests for agent configuration in Teams.
   * @template TData Type of data expected in the configuration fetch request
   * @param handler Function to handle the configuration fetch request
   * @returns The TeamsApplication instance for chaining
   */
  public configFetch<TData extends Record<string, any>>(
    handler: (context: TurnContext, state: TState, data: TData) => Promise<AgentConfigAuth | TaskModuleResponse>
  ): TeamsApplication<TState> {
    const selector = (context: TurnContext) => {
      const { CONFIG_FETCH_INVOKE_NAME } = TaskModuleInvokeNames
      return Promise.resolve(
        context?.activity?.type === ActivityTypes.Invoke && context?.activity?.name === CONFIG_FETCH_INVOKE_NAME
      )
    }
    this._app.addRoute(
      selector,
      async (context, state) => {
        if (context?.activity?.channelId === Channels.Msteams) {
          const result = await handler(context, state, (context.activity.value as TData)?.data ?? {} as TData)
          let response: ConfigResponse
          if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
            response = {
              responseType: 'config',
              config: result
            }

            if ('cacheInfo' in result) {
              response.cacheInfo = result.cacheInfo
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

  /**
   * Handles configuration submit requests for agent configuration in Teams.
   * @template TData Type of data expected in the configuration submit request
   * @param handler Function to handle the configuration submit request
   * @returns The TeamsApplication instance for chaining
   */
  public configSubmit<TData extends Record<string, any>>(
    handler: (context: TurnContext, state: TState, data: TData) => Promise<AgentConfigAuth | TaskModuleResponse>
  ): TeamsApplication<TState> {
    const selector = (context: TurnContext) => {
      const { CONFIG_SUBMIT_INVOKE_NAME } = TaskModuleInvokeNames
      return Promise.resolve(
        context?.activity?.type === ActivityTypes.Invoke &&
                    context?.activity?.name === CONFIG_SUBMIT_INVOKE_NAME
      )
    }
    this._app.addRoute(
      selector,
      async (context, state) => {
        if (context?.activity?.channelId === Channels.Msteams) {
          const result = await handler(context, state, (context.activity.value as TData)?.data ?? {} as TData)
          let response: ConfigResponse
          if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
            response = {
              responseType: 'config',
              config: result
            }
            if ('cacheInfo' in result) {
              response.cacheInfo = result.cacheInfo
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

/**
 * Creates a route selector for task modules based on the provided verb and invoke name.
 * @param verb Identifier for the task module (string, RegExp, or RouteSelector)
 * @param filterField Field name to filter on in the task data
 * @param invokeName Name of the invoke activity
 * @returns A RouteSelector function
 */
function createTaskSelector (
  verb: string | RegExp | RouteSelector,
  filterField: string,
  invokeName: string
): RouteSelector {
  if (typeof verb === 'function') {
    return verb
  } else if (verb instanceof RegExp) {
    return (context: TurnContext) => {
      const isTeams = context.activity.channelId === Channels.Msteams
      const isInvoke = context?.activity?.type === ActivityTypes.Invoke && context?.activity?.name === invokeName
      const data = (context?.activity?.value as any)?.data
      if (isInvoke && isTeams && typeof data === 'object' && typeof data[filterField] === 'string') {
        return Promise.resolve(verb.test(data[filterField]))
      } else {
        return Promise.resolve(false)
      }
    }
  } else {
    return (context: TurnContext) => {
      const isInvoke = context?.activity?.type === ActivityTypes.Invoke && context?.activity?.name === invokeName
      const data = (context?.activity?.value as any)?.data
      return Promise.resolve(isInvoke && typeof data === 'object' && data[filterField] === verb)
    }
  }
}
