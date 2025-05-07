import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { MessagingExtensionQuery, messagingExtensionQueryZodSchema } from './messagingExtensionQuery'
import { MessagingExtensionResponse } from './messagingExtensionResponse'
import { MessagingExtensionResult } from './messagingExtensionResult'

export type RouteQueryHandler<TState extends TurnState> = (context: TurnContext, state: TState, query: MessagingExtensionQuery) => Promise<MessagingExtensionResult>
export type SelectItemHandler<TState extends TurnState> = (context: TurnContext, state: TState, item: unknown) => Promise<MessagingExtensionResult>
/**
 * Class that exposes Teams messaging extension-related events.
 * Provides an organized way to handle messaging extension operations in Microsoft Teams.
 */
export class MessageExtension {
  _app: AgentApplication<TurnState>

  /**
   * Creates a new instance of the MessageExtension class.
   * @param app - The agent application
   */
  constructor (app: AgentApplication<TurnState>) {
    this._app = app
  }

  /**
   * Handles queries from messaging extensions.
   * @param handler - The handler to call when a query is received
   * @returns this (for method chaining)
   */
  onQuery (handler: RouteQueryHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'composeExtension/query'
      )
    }
    const routeHandler : RouteHandler<TurnState> = async (context: TurnContext, state: TurnState) => {
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

  // /**
  //  * Handles link queries from messaging extensions.
  //  * @param handler - The handler to call when a link query is received
  //  * @returns this (for method chaining)
  //  */
  // onQueryLink (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/queryLink'
  //     )
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }

  // /**
  //  * Handles anonymous link queries (for public access) from messaging extensions.
  //  * @param handler - The handler to call when an anonymous link query is received
  //  * @returns this (for method chaining)
  //  */
  // onAnonymousQueryLink (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/anonymousQueryLink'
  //     )
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }

  // /**
  //  * Handles selection of items from a messaging extension result.
  //  * @param handler - The handler to call when an item is selected
  //  * @returns this (for method chaining)
  //  */
  // onSelectItem (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/selectItem'
  //     )
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }

  // /**
  //  * Handles fetch task requests from messaging extensions.
  //  * @param handler - The handler to call when a fetch task is requested
  //  * @returns this (for method chaining)
  //  */
  // onFetchTask (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/fetchTask'
  //     )
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }

  // /**
  //  * Handles action submissions from messaging extensions.
  //  * @param handler - The handler to call when an action is submitted
  //  * @returns this (for method chaining)
  //  */
  // onSubmitAction (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/submitAction' // && TODO
  //       // (!context.activity.value || !('botMessagePreviewAction' in context.activity.value.))
  //     )
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }

  // /**
  //  * Handles message preview edit actions from messaging extensions.
  //  * @param handler - The handler to call when a message preview edit action is received
  //  * @returns this (for method chaining)
  //  */
  // onMessagePreviewEdit (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(!!(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/submitAction' &&
  //       context.activity.value &&
  //       // @ts-ignore
  //       context.activity.value['botMessagePreviewAction'] === 'edit'))
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }

  // /**
  //  * Handles message preview send actions from messaging extensions.
  //  * @param handler - The handler to call when a message preview send action is received
  //  * @returns this (for method chaining)
  //  */
  // onMessagePreviewSend (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(!!(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/submitAction' &&
  //       context.activity.value &&
  //       // @ts-ignore
  //       context.activity.value['botMessagePreviewAction'] === send))
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }

  // /**
  //  * Handles configuration query setting URL requests from messaging extensions.
  //  * @param handler - The handler to call when a config query setting URL is requested
  //  * @returns this (for method chaining)
  //  */
  // onConfigurationQuerySettingUrl (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/querySettingUrl'
  //     )
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }

  // /**
  //  * Handles configuration setting updates from messaging extensions.
  //  * @param handler - The handler to call when configuration settings are updated
  //  * @returns this (for method chaining)
  //  */
  // onConfigurationSetting (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/setting'
  //     )
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }

  // /**
  //  * Handles card button click events from messaging extensions.
  //  * @param handler - The handler to call when a card button is clicked
  //  * @returns this (for method chaining)
  //  */
  // onCardButtonClicked (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/onCardButtonClicked'
  //     )
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }

  // /**
  //  * Handles app-based link query events.
  //  * @param handler - The handler to call when an app-based link query is received
  //  * @returns this (for method chaining)
  //  */
  // onAppBasedLinkQuery (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(!!(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/queryLink' &&
  //       context.activity.value))
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }

  // /**
  //  * Handles anonymous app-based link query events.
  //  * @param handler - The handler to call when an anonymous app-based link query is received
  //  * @returns this (for method chaining)
  //  */
  // onAnonymousAppBasedLinkQuery (handler: RouteHandler<TurnState>) {
  //   const routeSel: RouteSelector = (context: TurnContext) => {
  //     return Promise.resolve(!!(
  //       context.activity.type === ActivityTypes.Invoke &&
  //       context.activity.channelId === 'msteams' &&
  //       context.activity.name === 'composeExtension/anonymousQueryLink' &&
  //       context.activity.value))
  //   }
  //   this._app.addRoute(routeSel, handler, true)
  //   return this
  // }
}
