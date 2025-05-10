import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'

/**
 * Class that exposes Teams task module-related events.
 * Provides an organized way to handle task module operations in Microsoft Teams.
 */
export class TaskModule {
  _app: AgentApplication<TurnState>

  /**
   * Creates a new instance of the TaskModule class.
   * @param app - The agent application
   */
  constructor (app: AgentApplication<TurnState>) {
    this._app = app
  }

  /**
   * Handles task module fetch events. These occur when a task module is requested to be displayed.
   * @param handler - The handler to call when a task module fetch event occurs
   * @returns this (for method chaining)
   */
  onFetch (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'task/fetch'
      )
    }
    this._app.addRoute(routeSel, handler, true) // Invoke requires true
    return this
  }

  /**
   * Handles task module submit events. These occur when a task module form is submitted.
   * @param handler - The handler to call when a task module submit event occurs
   * @returns this (for method chaining)
   */
  onSubmit (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'task/submit'
      )
    }
    this._app.addRoute(routeSel, handler, true)
    return this
  }

  /**
   * Handles specific task module fetch events based on a verb/action.
   * @param verb - The verb or action identifier to match against in the task module data
   * @param handler - The handler to call when a matching task module fetch event occurs
   * @returns this (for method chaining)
   */
  onFetchByVerb (verb: string, handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'task/fetch' &&
        // @ts-ignore
        context.activity.value?.data === verb
      )
    }
    this._app.addRoute(routeSel, handler, true)
    return this
  }

  /**
   * Handles specific task module submit events based on a verb/action.
   * @param verb - The verb or action identifier to match against in the task module data
   * @param handler - The handler to call when a matching task module submit event occurs
   * @returns this (for method chaining)
   */
  onSubmitByVerb (verb: string, handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'task/submit' &&
        // @ts-ignore
        context.activity.value?.data === verb
      )
    }
    this._app.addRoute(routeSel, handler, true)
    return this
  }

  /**
   * Handles configuration fetch events. These occur when an agent configuration is requested.
   * @param handler - The handler to call when a configuration fetch event occurs
   * @returns this (for method chaining)
   */
  onConfigurationFetch (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'config/fetch'
      )
    }
    this._app.addRoute(routeSel, handler, true)
    return this
  }

  /**
   * Handles configuration submit events. These occur when an agent configuration is submitted.
   * @param handler - The handler to call when a configuration submit event occurs
   * @returns this (for method chaining)
   */
  onConfigurationSubmit (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'config/submit'
      )
    }
    this._app.addRoute(routeSel, handler, true)
    return this
  }
}
