/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { INVOKE_RESPONSE_KEY, InvokeResponse, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsApplication } from '../teamsApplication'
import { TaskModuleTaskInfo } from '../../task/taskModuleTaskInfo'
import { MessagingExtensionResult } from '../../messaging-extension/messagingExtensionResult'
import { MessagingExtensionActionResponse } from '../../messaging-extension/messagingExtensionActionResponse'
import { MessagingExtensionParameter } from '../../messaging-extension/messagingExtensionParameter'
import { MessagingExtensionQuery } from '../../messaging-extension/messagingExtensionQuery'
import { TaskModuleResponse } from '../../task/taskModuleResponse'
import { MessageExtensionsInvokeNames } from './messageExtensionsInvokeNames'
import { parseValueAgentActivityPreview, parseValueAgentMessagePreviewAction, parseValueCommandId, parseValueQuery } from '../../parsers'
import { Query } from '../query'

/**
 * The MessageExtensions class provides methods to handle various messaging extension scenarios in a Teams application.
 * It allows developers to define handlers for different invoke activities such as queries, task fetches, and message previews.
 * @template TState - The type of the TurnState used in the application.
 */
export class MessageExtensions<TState extends TurnState> {
  private readonly _app: TeamsApplication<TState>

  /**
   * Creates an instance of MessageExtensions.
   * @param app - The TeamsApplication instance to associate with this MessageExtensions instance.
   */
  public constructor (app: TeamsApplication<TState>) {
    this._app = app
  }

  /**
   * Registers a handler for the anonymous query link invoke activity.
   * @param handler - A function to handle the anonymous query link.
   * @returns The TeamsApplication instance.
   */
  public anonymousQueryLink (
    handler: (context: TurnContext, state: TState, url: string) => Promise<MessagingExtensionResult>
  ): TeamsApplication<TState> {
    const { ANONYMOUS_QUERY_LINK_INVOKE } = MessageExtensionsInvokeNames
    const selector = (context: TurnContext) =>
      Promise.resolve(
        context?.activity?.type === ActivityTypes.Invoke &&
                    context?.activity.name === ANONYMOUS_QUERY_LINK_INVOKE
      )
    this._app.addRoute(
      selector,
      async (context, state) => {
        const activityValueUrl = parseValueQuery(context.activity.value)
        const result = await handler(context, state, activityValueUrl.url ?? '')
        if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
          const response = {
            composeExtension: result
          }
          await context.sendActivity({
            value: { body: response, status: 200 } as InvokeResponse,
            type: ActivityTypes.InvokeResponse
          } as Activity)
        }
      },
      true
    )

    return this._app
  }

  /**
   * Registers a handler for editing a message preview.
   * @param commandId - The command ID(s) or selector(s) to match the activity.
   * @param handler - A function to handle the message preview edit.
   * @returns The TeamsApplication instance.
   */
  public messagePreviewEdit (
    commandId: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (
      context: TurnContext,
      state: TState,
      previewActivity: Partial<Activity>
    ) => Promise<MessagingExtensionResult | TaskModuleTaskInfo | string | null | undefined>
  ): TeamsApplication<TState> {
    const { SUBMIT_ACTION_INVOKE } = MessageExtensionsInvokeNames;
    (Array.isArray(commandId) ? commandId : [commandId]).forEach((cid) => {
      const selector = createTaskSelector(cid, SUBMIT_ACTION_INVOKE, 'edit')
      this._app.addRoute(
        selector,
        async (context, state) => {
          const activityValue = parseValueAgentMessagePreviewAction(context.activity.value)
          if (context?.activity?.type !== ActivityTypes.Invoke ||
            context?.activity?.name !== SUBMIT_ACTION_INVOKE ||
            activityValue.botMessagePreviewAction !== 'edit'
          ) {
            throw new Error(
                            `Unexpected MessageExtensions.messagePreviewEdit() triggered for activity type: ${context?.activity?.type}`
            )
          }

          const activityActivityPreview = parseValueAgentActivityPreview(context.activity.value)
          const result = await handler(context, state, (activityActivityPreview as any).botActivityPreview[0] as Partial<Activity> ?? {})
          await this.returnSubmitActionResponse(context, result)
        },
        true
      )
    })
    return this._app
  }

  /**
   * Registers a handler for sending a message preview.
   * @param commandId - The command ID(s) or selector(s) to match the activity.
   * @param handler - A function to handle the message preview send.
   * @returns The TeamsApplication instance.
   */
  public messagePreviewSend (
    commandId: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState, previewActivity: Partial<Activity>) => Promise<void>
  ): TeamsApplication<TState> {
    const { SUBMIT_ACTION_INVOKE } = MessageExtensionsInvokeNames;
    (Array.isArray(commandId) ? commandId : [commandId]).forEach((cid) => {
      const selector = createTaskSelector(cid, SUBMIT_ACTION_INVOKE, 'send')
      this._app.addRoute(
        selector,
        async (context, state) => {
          const activityMessagePreviewAction = parseValueAgentMessagePreviewAction(context.activity.value)
          if (
            context?.activity?.type !== ActivityTypes.Invoke ||
                        context?.activity?.name !== SUBMIT_ACTION_INVOKE ||
                        activityMessagePreviewAction.botMessagePreviewAction !== 'send'
          ) {
            throw new Error(
                            `Unexpected MessageExtensions.messagePreviewSend() triggered for activity type: ${context?.activity?.type}`
            )
          }

          const activityActivityPreview = parseValueAgentActivityPreview(context.activity.value)
          await handler(context, state, (activityActivityPreview as any).botActivityPreview[0] as Partial<Activity> ?? {})

          if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
            await context.sendActivity({
              value: { body: {}, status: 200 } as InvokeResponse,
              type: ActivityTypes.InvokeResponse
            } as Activity)
          }
        },
        true
      )
    })
    return this._app
  }

  /**
   * Registers a handler for fetching a task module.
   * @param commandId - The command ID(s) or selector(s) to match the activity.
   * @param handler - A function to handle the task fetch.
   * @returns The TeamsApplication instance.
   */
  public fetchTask (
    commandId: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState) => Promise<TaskModuleTaskInfo | string>
  ): TeamsApplication<TState> {
    const { FETCH_TASK_INVOKE } = MessageExtensionsInvokeNames;
    (Array.isArray(commandId) ? commandId : [commandId]).forEach((cid) => {
      const selector = createTaskSelector(cid, FETCH_TASK_INVOKE)
      this._app.addRoute(
        selector,
        async (context, state) => {
          if (
            context?.activity?.type !== ActivityTypes.Invoke ||
                        context?.activity?.name !== FETCH_TASK_INVOKE
          ) {
            throw new Error(
                            `Unexpected MessageExtensions.fetchTask() triggered for activity type: ${context?.activity?.type}`
            )
          }

          const result = await handler(context, state)
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
        },
        true
      )
    })
    return this._app
  }

  /**
   * Registers a handler for a query invoke activity.
   * @param commandId - The command ID(s) or selector(s) to match the activity.
   * @param handler - A function to handle the query.
   * @returns The TeamsApplication instance.
   */
  public query<TParams extends Record<string, any> = Record<string, any>>(
    commandId: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState, query: Query<TParams>) => Promise<MessagingExtensionResult>
  ): TeamsApplication<TState> {
    const { QUERY_INVOKE } = MessageExtensionsInvokeNames;
    (Array.isArray(commandId) ? commandId : [commandId]).forEach((cid) => {
      const selector = createTaskSelector(cid, QUERY_INVOKE)
      this._app.addRoute(
        selector,
        async (context, state) => {
          if (context?.activity?.type !== ActivityTypes.Invoke || context?.activity?.name !== QUERY_INVOKE) {
            throw new Error(
                            `Unexpected MessageExtensions.query() triggered for activity type: ${context?.activity?.type}`
            )
          }

          const meQuery: MessagingExtensionQuery = context?.activity?.value ?? {}
          const query: Query<TParams> = {
            count: meQuery?.queryOptions?.count ?? 25,
            skip: meQuery?.queryOptions?.skip ?? 0,
            parameters: {} as TParams
          };

          (meQuery.parameters ?? []).forEach((param: MessagingExtensionParameter) => {
            if (param.name) {
              (query.parameters as any)[param.name] = param.value
            }
          })

          const result = await handler(context, state, query)
          if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
            const response: MessagingExtensionActionResponse = {
              composeExtension: result
            }

            await context.sendActivity({
              value: { body: response, status: 200 } as InvokeResponse,
              type: ActivityTypes.InvokeResponse
            } as Activity)
          }
        },
        true
      )
    })
    return this._app
  }

  /**
   * Registers a handler for a query link invoke activity.
   * @param handler - A function to handle the query link.
   * @returns The TeamsApplication instance.
   */
  public queryLink (
    handler: (context: TurnContext, state: TState, url: string) => Promise<MessagingExtensionResult>
  ): TeamsApplication<TState> {
    const { QUERY_LINK_INVOKE } = MessageExtensionsInvokeNames
    const selector = (context: TurnContext) =>
      Promise.resolve(
        context?.activity?.type === ActivityTypes.Invoke && context?.activity.name === QUERY_LINK_INVOKE
      )

    this._app.addRoute(
      selector,
      async (context, state) => {
        const activityValueUrl = parseValueQuery(context.activity.value)
        const result = await handler(context, state, activityValueUrl.url)
        if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
          const response: MessagingExtensionActionResponse = {
            composeExtension: result
          }

          await context.sendActivity({
            value: { body: response, status: 200 } as InvokeResponse,
            type: ActivityTypes.InvokeResponse
          } as Activity)
        }
      },
      true
    )

    return this._app
  }

  /**
   * Registers a handler for selecting an item in a messaging extension.
   * @param handler - A function to handle the item selection.
   * @returns The TeamsApplication instance.
   */
  public selectItem<TItem extends Record<string, any> = Record<string, any>>(
    handler: (context: TurnContext, state: TState, item: TItem) => Promise<MessagingExtensionResult>
  ): TeamsApplication<TState> {
    const { SELECT_ITEM_INVOKE } = MessageExtensionsInvokeNames
    const selector = (context: TurnContext) =>
      Promise.resolve(
        context?.activity?.type === ActivityTypes.Invoke && context?.activity.name === SELECT_ITEM_INVOKE
      )

    this._app.addRoute(
      selector,
      async (context, state) => {
        const result = await handler(context, state, context?.activity?.value as TItem ?? {} as TItem)
        if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
          const response: MessagingExtensionActionResponse = {
            composeExtension: result
          }

          await context.sendActivity({
            value: { body: response, status: 200 } as InvokeResponse,
            type: ActivityTypes.InvokeResponse
          } as Activity)
        }
      },
      true
    )

    return this._app
  }

  /**
   * Registers a handler for submitting an action in a messaging extension.
   * @param commandId - The command ID(s) or selector(s) to match the activity.
   * @param handler - A function to handle the action submission.
   * @returns The TeamsApplication instance.
   */
  public submitAction<TData extends Record<string, any>>(
    commandId: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (
      context: TurnContext,
      state: TState,
      data: TData
    ) => Promise<MessagingExtensionResult | TaskModuleTaskInfo | string | null | undefined>
  ): TeamsApplication<TState> {
    const { SUBMIT_ACTION_INVOKE } = MessageExtensionsInvokeNames;
    (Array.isArray(commandId) ? commandId : [commandId]).forEach((cid) => {
      const selector = createTaskSelector(cid, SUBMIT_ACTION_INVOKE)
      this._app.addRoute(
        selector,
        async (context, state) => {
          if (
            context?.activity?.type !== ActivityTypes.Invoke ||
                        context?.activity?.name !== SUBMIT_ACTION_INVOKE
          ) {
            throw new Error(
                            `Unexpected MessageExtensions.submitAction() triggered for activity type: ${context?.activity?.type}`
            )
          }

          const result = await handler(context, state, (context.activity.value as TData)?.data ?? {} as TData)
          await this.returnSubmitActionResponse(context, result)
        },
        true
      )
    })
    return this._app
  }

  /**
   * Sends a response for a submit action invoke activity.
   * @param context - The TurnContext of the activity.
   * @param result - The result to send in the response.
   */
  private async returnSubmitActionResponse (
    context: TurnContext,
    result: MessagingExtensionResult | TaskModuleTaskInfo | string | null | undefined
  ): Promise<void> {
    if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
      let response: MessagingExtensionActionResponse
      if (typeof result === 'string') {
        response = {
          task: {
            type: 'message',
            value: result
          }
        }
      } else if (typeof result === 'object' && result != null) {
        if ((result as TaskModuleTaskInfo).card) {
          response = {
            task: {
              type: 'continue',
              value: result as TaskModuleTaskInfo
            }
          }
        } else {
          response = {
            composeExtension: result as MessagingExtensionResult
          }
        }
      } else {
        response = {
          composeExtension: undefined
        }
      }

      await context.sendActivity({
        value: { body: response, status: 200 } as InvokeResponse,
        type: ActivityTypes.InvokeResponse
      } as Activity)
    }
  }

  /**
   * Registers a handler for querying a URL setting in a messaging extension.
   * @param handler - A function to handle the URL setting query.
   * @returns The TeamsApplication instance.
   */
  public queryUrlSetting (
    handler: (context: TurnContext, state: TState) => Promise<MessagingExtensionResult>
  ): TeamsApplication<TState> {
    const { QUERY_SETTING_URL } = MessageExtensionsInvokeNames
    const selector = (context: TurnContext) =>
      Promise.resolve(
        context?.activity?.type === ActivityTypes.Invoke && context?.activity.name === QUERY_SETTING_URL
      )

    this._app.addRoute(
      selector,
      async (context, state) => {
        const result = await handler(context, state)
        if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
          const response: MessagingExtensionActionResponse = {
            composeExtension: result
          }
          await context.sendActivity({
            value: { status: 200, body: response } as InvokeResponse,
            type: ActivityTypes.InvokeResponse
          } as Activity)
        }
      },
      true
    )

    return this._app
  }

  /**
   * Registers a handler for configuring settings in a messaging extension.
   * @param handler - A function to handle the settings configuration.
   * @returns The TeamsApplication instance.
   */
  public configureSettings<TData extends Record<string, any>>(
    handler: (context: TurnContext, state: TState, settings: TData) => Promise<void>
  ): TeamsApplication<TState> {
    const { CONFIGURE_SETTINGS } = MessageExtensionsInvokeNames
    const selector = (context: TurnContext) =>
      Promise.resolve(
        context?.activity?.type === ActivityTypes.Invoke && context?.activity.name === CONFIGURE_SETTINGS
      )

    this._app.addRoute(
      selector,
      async (context, state) => {
        await handler(context, state, context.activity.value as TData ?? {} as TData)
        if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
          await context.sendActivity({
            value: { status: 200 } as InvokeResponse,
            type: ActivityTypes.InvokeResponse
          } as Activity)
        }
      },
      true
    )

    return this._app
  }

  /**
   * Registers a handler for handling button clicks in a messaging extension card.
   * @param handler - A function to handle the button click.
   * @returns The TeamsApplication instance.
   */
  public handleOnButtonClicked<TData extends Record<string, any>>(
    handler: (context: TurnContext, state: TState, data: TData) => Promise<void>
  ): TeamsApplication<TState> {
    const { QUERY_CARD_BUTTON_CLICKED } = MessageExtensionsInvokeNames
    const selector = (context: TurnContext) =>
      Promise.resolve(
        context?.activity?.type === ActivityTypes.Invoke && context?.activity.name === QUERY_CARD_BUTTON_CLICKED
      )

    this._app.addRoute(
      selector,
      async (context, state) => {
        await handler(context, state, context.activity.value as TData ?? {} as TData)
        if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
          await context.sendActivity({
            value: { status: 200 } as InvokeResponse,
            type: ActivityTypes.InvokeResponse
          } as Activity)
        }
      },
      true
    )

    return this._app
  }
}

function createTaskSelector (
  commandId: string | RegExp | RouteSelector,
  invokeName: string,
  messagePreviewAction?: 'edit' | 'send'
): RouteSelector {
  if (typeof commandId === 'function') {
    return commandId
  } else if (commandId instanceof RegExp) {
    return (context: TurnContext) => {
      const activityValue = parseValueCommandId(context.activity.value)
      const isInvoke = context?.activity?.type === ActivityTypes.Invoke && context?.activity?.name === invokeName
      if (
        isInvoke &&
                typeof activityValue.commandId === 'string' &&

                matchesPreviewAction(context.activity, messagePreviewAction)
      ) {
        return Promise.resolve(commandId.test(activityValue.commandId))
      } else {
        return Promise.resolve(false)
      }
    }
  } else {
    return (context: TurnContext) => {
      if (!context.activity.name?.includes('task')) {
        const activityValue = parseValueCommandId(context.activity.value)
        const isInvoke = context?.activity?.type === ActivityTypes.Invoke && context?.activity?.name === invokeName
        return Promise.resolve(
          isInvoke &&
                      activityValue.commandId === commandId &&
                      matchesPreviewAction(context.activity, messagePreviewAction)
        )
      }
      return Promise.resolve(false)
    }
  }
}

function matchesPreviewAction (activity: Activity, messagePreviewAction?: 'edit' | 'send'): boolean {
  if ('botMessagePreviewAction' in (activity?.value as any)) {
    const activityValue = parseValueAgentMessagePreviewAction(activity.value)
    return activityValue.botMessagePreviewAction === messagePreviewAction
  } else {
    return messagePreviewAction === undefined
  }
}
