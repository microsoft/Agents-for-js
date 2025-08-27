import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { z } from 'zod'
import { TaskModuleResponse } from '../taskModule'
import { MessagingExtensionActionResponse } from './messagingExtensionActionResponse'
import { MessagingExtensionQuery, messagingExtensionQueryZodSchema } from './messagingExtensionQuery'
import { MessagingExtensionResponse } from './messagingExtensionResponse'
import { MessagingExtensionResult } from './messagingExtensionResult'
import { MessagingExtensionAction } from './messagingExtensionAction'

export type RouteQueryHandler<TState extends TurnState> = (context: TurnContext, state: TState, query: MessagingExtensionQuery) => Promise<MessagingExtensionResult>
export type SelectItemHandler<TState extends TurnState> = (context: TurnContext, state: TState, item: unknown) => Promise<MessagingExtensionResult>
export type QueryLinkHandler<TState extends TurnState> = (context: TurnContext, state: TState, url: string) => Promise<MessagingExtensionResult>
export type FetchTaskHanlder<TState extends TurnState> = (context: TurnContext, state: TState) => Promise<TaskModuleResponse>
export type SubmitActionHanlder<TState extends TurnState> = (context: TurnContext, state: TState, data: unknown) => Promise<MessagingExtensionActionResponse>
export type MessagePreviewEditHandler<TState extends TurnState> = (context: TurnContext, state: TState, activity: Activity) => Promise<MessagingExtensionActionResponse>
export type MessagePreviewSendHandler<TState extends TurnState> = (context: TurnContext, state: TState, activity: Activity) => Promise<void>
export type ConfigureSettingsHandler<TState extends TurnState> = (context: TurnContext, state: TState, settings: unknown) => Promise<void>
export type CardButtonClickedHandler<TState extends TurnState> = (context: TurnContext, state: TState, cardData: unknown) => Promise<void>
/**
 * Class that exposes Teams messaging extension-related events.
 * Provides an organized way to handle messaging extension operations in Microsoft Teams.
 */
export class MessageExtension<TState extends TurnState> {
  _app: AgentApplication<TState>

  /**
   * Creates a new instance of the MessageExtension class.
   * @param app - The agent application
   */
  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  /**
   * Handles queries from messaging extensions.
   * @param handler - The handler to call when a query is received
   * @returns this (for method chaining)
   */
  onQuery (handler: RouteQueryHandler<TState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/query'
      )
    }
    const routeHandler : RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const messageExtensionQuery: MessagingExtensionQuery = messagingExtensionQueryZodSchema.parse(context.activity.value)
      const parameters: Record<string, unknown> = {}
      messageExtensionQuery.parameters?.forEach((param) => {
        parameters[param.name!] = param.value
      })
      const result : MessagingExtensionResult = await handler(context, state, messageExtensionQuery)
      const response: MessagingExtensionResponse = { composeExtension: result }
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = {
        status: 200,
        body: response
      }
      context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true) // Invoke requires true
    return this
  }

  onSelectItem (handler: SelectItemHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/selectItem'
      )
    }
    const routeHandler : RouteHandler<TurnState> = async (context: TurnContext, state: TurnState) => {
      const result : MessagingExtensionResult = await handler(context, state, context.activity.value)
      const response: MessagingExtensionResponse = { composeExtension: result }
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = {
        status: 200,
        body: response
      }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true) // Invoke requires true
    return this
  }

  /**
   * Handles link queries from messaging extensions.
   * @param handler - The handler to call when a link query is received
   * @returns this (for method chaining)
  */
  onQueryLink (handler: QueryLinkHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
       context.activity.channelId === 'msteams' &&
       context.activity.name === 'composeExtension/queryLink'
      )
    }
    const routeHandler : RouteHandler<TurnState> = async (context: TurnContext, state: TurnState) => {
      const appBasedLinkQuerySchema = z.object({
        url: z.string().url()
      })
      const query = appBasedLinkQuerySchema.parse(context.activity.value)
      const res = await handler(context, state, query.url)
      const response: MessagingExtensionResponse = { composeExtension: res }
      const invokeResponse = Activity.fromObject({ type: ActivityTypes.InvokeResponse, value: { status: 200, body: response } })
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true)
    return this
  }

  /**
   * Handles anonymous link queries (for public access) from messaging extensions.
   * @param handler - The handler to call when an anonymous link query is received
   * @returns this (for method chaining)
  */
  onAnonymousQueryLink (handler: QueryLinkHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/anonymousQueryLink'
      )
    }
    const routeHandler : RouteHandler<TurnState> = async (context: TurnContext, state: TurnState) => {
      const appBasedLinkQuerySchema = z.object({
        url: z.string().url()
      })
      const query = appBasedLinkQuerySchema.parse(context.activity.value)
      const res = await handler(context, state, query.url)
      const response: MessagingExtensionResponse = { composeExtension: res }
      const invokeResponse = Activity.fromObject({ type: ActivityTypes.InvokeResponse, value: { status: 200, body: response } })
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true)
    return this
  }

  /**
   * Handles fetch task requests from messaging extensions.
   * @param handler - The handler to call when a fetch task is requested
   * @returns this (for method chaining)
  */
  onFetchTask (handler: FetchTaskHanlder<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/fetchTask'
      )
    }
    const routeHandler: RouteHandler<TurnState> = async (context: TurnContext, state: TurnState) => {
      const taskModuleResponse: TaskModuleResponse = await handler(context, state)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = {
        status: 200,
        body: taskModuleResponse
      }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true)
    return this
  }

  /**
   * Handles action submissions from messaging extensions.
   * @param handler - The handler to call when an action is submitted
   * @returns this (for method chaining)
   */
  onSubmitAction (handler: SubmitActionHanlder<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/submitAction' // && TODO
        // (!context.activity.value || !('botMessagePreviewAction' in context.activity.value.))
      )
    }
    const routeHandler: RouteHandler<TurnState> = async (context: TurnContext, state: TurnState) => {
      const data = context.activity.value
      const response: MessagingExtensionActionResponse = await handler(context, state, data)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = {
        status: 200,
        body: response
      }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true) // Invoke requires true
    return this
  }

  /**
   * Handles message preview edit actions from messaging extensions.
   * @param handler - The handler to call when a message preview edit action is received
   * @returns this (for method chaining)
   */
  onMessagePreviewEdit (handler: MessagePreviewEditHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(!!(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/submitAction' &&
        context.activity.value &&
        // @ts-ignore
        context.activity.value['botMessagePreviewAction'] === 'edit'))
    }
    const routeHandler: RouteHandler<TurnState> = async (context: TurnContext, state: TurnState) => {
      const activity = context.activity.value as Activity
      const response: MessagingExtensionActionResponse = await handler(context, state, activity)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = {
        status: 200,
        body: response
      }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true)
    return this
  }

  /**
   * Handles message preview send actions from messaging extensions.
   * @param handler - The handler to call when a message preview send action is received
   * @returns this (for method chaining)
   */
  onMessagePreviewSend (handler: MessagePreviewSendHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(!!(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/submitAction' &&
        context.activity.value &&
        // @ts-ignore
        context.activity.value['botMessagePreviewAction'] === 'send'))
    }
    const routeHandler: RouteHandler<TurnState> = async (context: TurnContext, state: TurnState) => {
      const msgExtensionAction: MessagingExtensionAction = context.activity.value as MessagingExtensionAction
      const activityPreview : Activity = msgExtensionAction.activityPreview?.length! > 0 ? Activity.fromObject(msgExtensionAction.activityPreview![0]) : new Activity(ActivityTypes.Message)
      await handler(context, state, activityPreview)
    }
    this._app.addRoute(routeSel, routeHandler, true)
    return this
  }

  /**
   * Handles configuration query setting URL requests from messaging extensions.
   * @param handler - The handler to call when a config query setting URL is requested
   * @returns this (for method chaining)
   */
  onConfigurationQuerySettingUrl (handler: ConfigureSettingsHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/querySettingUrl'
      )
    }
    const routeHandler: RouteHandler<TurnState> = async (context: TurnContext, state: TurnState) => {
      await handler(context, state, context.activity.value)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = {
        status: 200
      }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true)
    return this
  }

  /**
   * Handles configuration setting updates from messaging extensions.
   * @param handler - The handler to call when configuration settings are updated
   * @returns this (for method chaining)
   */
  onConfigurationSetting (handler: ConfigureSettingsHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/setting'
      )
    }
    const routeHandler: RouteHandler<TurnState> = async (context: TurnContext, state: TurnState) => {
      await handler(context, state, context.activity.value)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = {
        status: 200
      }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true)
    return this
  }

  /**
   * Handles card button click events from messaging extensions.
   * @param handler - The handler to call when a card button is clicked
   * @returns this (for method chaining)
   */
  onCardButtonClicked (handler: CardButtonClickedHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/onCardButtonClicked'
      )
    }
    const routeHandler: RouteHandler<TurnState> = async (context: TurnContext, state: TurnState) => {
      await handler(context, state, context.activity.value)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = {
        status: 200
      }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true)
    return this
  }
}
