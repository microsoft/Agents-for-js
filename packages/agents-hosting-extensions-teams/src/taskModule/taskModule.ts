import { Activity, ActivityTypes, Channels, ExceptionHelper } from '@microsoft/agents-activity'
import { AgentApplication, INVOKE_RESPONSE_KEY, InvokeResponse, RouteHandler, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Errors } from '../errorHelper'
import { TaskModuleTaskInfo } from './taskModuleTaskInfo'
import { TaskModuleResponse } from './taskModuleResponse'

enum TaskModuleInvokeNames {
  CONFIG_FETCH_INVOKE_NAME = 'config/fetch',
  CONFIG_SUBMIT_INVOKE_NAME = 'config/submit',
  FETCH_INVOKE_NAME = 'task/fetch',
  SUBMIT_INVOKE_NAME = 'task/submit',
  DEFAULT_TASK_DATA_FILTER = 'verb'
}

interface TaskModuleOptions {
  taskDataFilter?: string
}

/**
 * Class that exposes Teams task module-related events.
 * Provides an organized way to handle task module operations in Microsoft Teams.
 */
export class TaskModule<TState extends TurnState> {
  _app: AgentApplication<TState>
  _options: TaskModuleOptions

  /**
   * Creates a new instance of the TaskModule class.
   * @param app - The agent application
   */
  constructor (app: AgentApplication<TState>, options?: TaskModuleOptions) {
    this._options = options ?? { taskDataFilter: TaskModuleInvokeNames.DEFAULT_TASK_DATA_FILTER }
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
     * Registers a handler to process the submission of a task module.
     * @remarks
     * Handlers should respond with another TaskInfo object, message string, or `null` to indicate
     * the task is completed.
     * @template TData Optional. Type of the data object being passed to the handler.
     * @param {string | RegExp | RouteSelector | string[] | RegExp[] | RouteSelector[]} verb - Name of the verb(s) to register the handler for.
     * @param {(context: TurnContext, state: TState, data: TData) => Promise<TaskModuleTaskInfo | string | null | undefined>} handler - Function to call when the handler is triggered.
     * @param {TurnContext} handler.context - Context for the current turn of conversation with the user.
     * @param {TState} handler.state - Current state of the turn.
     * @param {TData} handler.data - Data object passed to the handler.
     * @returns {Application<TState>} The application for chaining purposes.
     */
  public submit<TData extends Record<string, any> = Record<string, any>>(
    verb: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (
      context: TurnContext,
      state: TState,
      data: TData
    ) => Promise<TaskModuleTaskInfo | string | null | undefined>
  ): AgentApplication<TState> {
    (Array.isArray(verb) ? verb : [verb]).forEach((v) => {
      const { DEFAULT_TASK_DATA_FILTER, SUBMIT_INVOKE_NAME } = TaskModuleInvokeNames
      const filterField = this._options.taskDataFilter ?? DEFAULT_TASK_DATA_FILTER
      const selector = createTaskSelector(v, filterField, SUBMIT_INVOKE_NAME)
      this._app.addRoute(
        selector,
        async (context, state) => {
          if (context?.activity?.channelId === Channels.Msteams) {
            if (context?.activity?.type !== ActivityTypes.Invoke || context?.activity?.name !== SUBMIT_INVOKE_NAME) {
              throw ExceptionHelper.generateException(Error, Errors.UnexpectedTaskModuleSubmit, undefined, { activityType: context?.activity?.type })
            }
            const result = await handler(context, state, (context.activity.value as any).data ?? {})

            if (!result) {
              await context.sendActivity(Activity.fromObject({
                value: { status: 200 } as InvokeResponse,
                type: ActivityTypes.InvokeResponse
              }))
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
                // Return card
                response = {
                  task: {
                    type: 'continue',
                    value: result as TaskModuleTaskInfo
                  }
                }
              }

              // Queue up invoke response
              await context.sendActivity(Activity.fromObject({
                value: { body: response, status: 200 } as InvokeResponse,
                type: ActivityTypes.InvokeResponse
              }))
            }
          }
        },
        true
      )
    })
    return this._app
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

/**
 * Creates a route selector function for a given verb, filter field, and invoke name.
 * @param {string | RegExp | RouteSelector} verb - The verb to match.
 * @param {string} filterField - The field to use for filtering.
 * @param {string} invokeName - The name of the invoke action.
 * @returns {RouteSelector} The route selector function.
 * @private
 * @remarks
 * This function is used to create a route selector function for a given verb, filter field, and invoke name.
 * The route selector function is used to match incoming requests to the appropriate handler function.
 */
function createTaskSelector (
  verb: string | RegExp | RouteSelector,
  filterField: string,
  invokeName: string
): RouteSelector {
  if (typeof verb === 'function') {
    // Return the passed in selector function
    return verb
  } else if (verb instanceof RegExp) {
    // Return a function that matches the verb using a RegExp
    return (context: TurnContext) => {
      const isTeams = context.activity.channelId === Channels.Msteams
      const isInvoke = context?.activity?.type === ActivityTypes.Invoke && context?.activity?.name === invokeName
      const data = (context?.activity?.value as any).data
      if (isInvoke && isTeams && typeof data === 'object' && typeof data[filterField] === 'string') {
        return Promise.resolve(verb.test(data[filterField]))
      } else {
        return Promise.resolve(false)
      }
    }
  } else {
    // Return a function that attempts to match verb
    return (context: TurnContext) => {
      const isInvoke = context?.activity?.type === ActivityTypes.Invoke && context?.activity?.name === invokeName
      const data = (context?.activity?.value as any).data
      return Promise.resolve(isInvoke && typeof data === 'object' && data[filterField] === verb)
    }
  }
}
