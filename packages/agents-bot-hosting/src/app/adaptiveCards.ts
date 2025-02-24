/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  TurnContext,
  InvokeResponse,
  INVOKE_RESPONSE_KEY,
  AdaptiveCardInvokeResponse,
  MessageFactory,
  CardFactory,
} from '..'
import { Application, RouteSelector, Query } from './application'
import { TurnState } from './turnState'
import { Activity, ActivityTypes, AdaptiveCardInvokeAction, AdaptiveCardsSearchParams, validateAdaptiveCardInvokeAction, validateValueActionExecuteSelector, validateValueDataset, validateValueSearchQuery } from '@microsoft/agents-bot-activity'

export const ACTION_INVOKE_NAME = 'adaptiveCard/action'

const ACTION_EXECUTE_TYPE = 'Action.Execute'

const DEFAULT_ACTION_SUBMIT_FILTER = 'verb'

const SEARCH_INVOKE_NAME = 'application/search'

enum AdaptiveCardInvokeResponseType {
  ADAPTIVE = 'application/vnd.microsoft.card.adaptive',
  MESSAGE = 'application/vnd.microsoft.activity.message',
  SEARCH = 'application/vnd.microsoft.search.searchResponse'
}

export interface AdaptiveCard {
  type: 'AdaptiveCard';
  [key: string]: any;
}

export interface AdaptiveCardsOptions {
  actionSubmitFilter?: string;
  actionExecuteResponseType?: AdaptiveCardActionExecuteResponseType;
}

export enum AdaptiveCardActionExecuteResponseType {
  REPLACE_FOR_INTERACTOR,
  REPLACE_FOR_ALL,
  NEW_MESSAGE_FOR_ALL
}

export interface AdaptiveCardSearchResult {
  title: string;
  value: string;
}

export class AdaptiveCards<TState extends TurnState> {
  private readonly _app: Application<TState>

  public constructor (app: Application<TState>) {
    this._app = app
  }

  /**
     * Adds a route to the application for handling Adaptive Card Action.Execute events.
     * @template TData Optional. Type of the data associated with the action.
     * @param {string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[]} verb The named action(s) to be handled.
     * @param {(context: TurnContext, state: TState, data: TData) => Promise<AdaptiveCard | string>} handler The code to execute when the action is triggered.
     * @param {TurnContext} handler.context The current turn context.
     * @param {TState} handler.state The current turn state.
     * @param {TData} handler.data The data associated with the action.
     * @returns {Application<TState>} The application for chaining purposes.
     */
  public actionExecute<TData = Record<string, any>>(
    verb: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState, data: TData) => Promise<AdaptiveCard | string>
  ): Application<TState> {
    let actionExecuteResponseType =
            this._app.options.adaptiveCards?.actionExecuteResponseType ??
            AdaptiveCardActionExecuteResponseType.REPLACE_FOR_INTERACTOR;
    (Array.isArray(verb) ? verb : [verb]).forEach((v) => {
      const selector = createActionExecuteSelector(v)
      this._app.addRoute(
        selector,
        async (context: TurnContext, state: TState) => {
          // Insure that we're in an Action.Execute as expected
          const a = context?.activity
          if (
            a?.type !== ActivityTypes.Invoke ||
                        a?.name !== ACTION_INVOKE_NAME ||
                        (a?.value as AdaptiveCardInvokeAction).type !== ACTION_EXECUTE_TYPE
          ) {
            throw new Error(
                            `Unexpected AdaptiveCards.actionExecute() triggered for activity type: ${a?.type}`
            )
          }

          // Call handler and then check to see if an invoke response has already been added
          const result = await handler(context, state, (validateAdaptiveCardInvokeAction(a.value)).data as TData ?? {} as TData)
          if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
            // Format invoke response
            let response: AdaptiveCardInvokeResponse
            if (typeof result === 'string') {
              // Return message
              response = {
                statusCode: 200,
                type: AdaptiveCardInvokeResponseType.MESSAGE,
                value: result as any
              }
              await sendInvokeResponse(context, response)
            } else {
              // Return card
              if (
                result.refresh &&
                                actionExecuteResponseType !== AdaptiveCardActionExecuteResponseType.NEW_MESSAGE_FOR_ALL
              ) {
                // Card won't be refreshed with AdaptiveCardActionExecuteResponseType.REPLACE_FOR_INTERACTOR.
                // So set to AdaptiveCardActionExecuteResponseType.REPLACE_FOR_ALL here.
                actionExecuteResponseType = AdaptiveCardActionExecuteResponseType.REPLACE_FOR_ALL
              }

              const activity = MessageFactory.attachment(CardFactory.adaptiveCard(result))
              response = {
                statusCode: 200,
                type: AdaptiveCardInvokeResponseType.ADAPTIVE,
                value: result
              }
              if (
                actionExecuteResponseType === AdaptiveCardActionExecuteResponseType.NEW_MESSAGE_FOR_ALL
              ) {
                await sendInvokeResponse(context, {
                  statusCode: 200,
                  type: AdaptiveCardInvokeResponseType.MESSAGE,
                  value: 'Your response was sent to the app' as any
                })
                await context.sendActivity(activity)
              } else if (
                actionExecuteResponseType === AdaptiveCardActionExecuteResponseType.REPLACE_FOR_ALL
              ) {
                activity.id = context.activity.replyToId
                await context.updateActivity(activity)
                await sendInvokeResponse(context, response)
              } else {
                await sendInvokeResponse(context, response)
              }
            }
          }
        },
        true
      )
    })
    return this._app
  }

  /**
     * Adds a route to the application for handling Adaptive Card Action.Submit events.
     * @remarks
     * The route will be added for the specified verb(s) and will be filtered using the
     * `actionSubmitFilter` option. The default filter is to use the `verb` field.
     *
     * For outgoing AdaptiveCards you will need to include the verb's name in the cards Action.Submit.
     * For example:
     *
     * ```JSON
     * {
     *   "type": "Action.Submit",
     *   "title": "OK",
     *   "data": {
     *      "verb": "ok"
     *   }
     * }
     * ```
     * @template TData Optional. Type of the data associated with the action.
     * @param {string | RegExp | RouteSelector | string[] | RegExp[] | RouteSelector[]} verb The named action(s) to be handled.
     * @param {(context: TurnContext, state: TState, data: TData) => Promise<AdaptiveCard | string>} handler The code to execute when the action is triggered.
     * @returns {Application} The application for chaining purposes.
     */
  public actionSubmit<TData = Record<string, any>>(
    verb: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState, data: TData) => Promise<void>
  ): Application<TState> {
    const filter = this._app.options.adaptiveCards?.actionSubmitFilter ?? DEFAULT_ACTION_SUBMIT_FILTER;
    (Array.isArray(verb) ? verb : [verb]).forEach((v) => {
      const selector = createActionSubmitSelector(v, filter)
      this._app.addRoute(selector, async (context: TurnContext, state: TurnState) => {
        // Insure that we're in an Action.Execute as expected
        const a = context?.activity
        if (a?.type !== ActivityTypes.Message || a?.text || typeof a?.value !== 'object') {
          throw new Error(`Unexpected AdaptiveCards.actionSubmit() triggered for activity type: ${a?.type}`)
        }

        // Call handler
        await handler(context, state as TState, (validateAdaptiveCardInvokeAction(a.value)).data as TData ?? {} as TData)
      })
    })
    return this._app
  }

  /**
     * Adds a route to the application for handling the `Data.Query` request for an `Input.ChoiceSet`.
     * @param {string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[]} dataset The named dataset(s) to be handled.
     * @callback handler
     * @param {Function} handler The code to execute when the query is triggered.
     * @param {TurnContext} handler.context The current turn context for the handler callback.
     * @param {TState} handler.state The current turn state for the handler callback.
     * @param {Query<AdaptiveCardsSearchParams>} handler.query The query parameters for the handler callback.
     * @returns {this} The application for chaining purposes.
     */
  public search (
    dataset: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (
      context: TurnContext,
      state: TState,
      query: Query<AdaptiveCardsSearchParams>
    ) => Promise<AdaptiveCardSearchResult[]>
  ): Application<TState> {
    (Array.isArray(dataset) ? dataset : [dataset]).forEach((ds) => {
      const selector = createSearchSelector(ds)
      this._app.addRoute(
        selector,
        async (context, state) => {
          // Insure that we're in an Action.Execute as expected
          const a = context?.activity
          if (a?.type !== ActivityTypes.Invoke || a?.name !== SEARCH_INVOKE_NAME) {
            throw new Error(`Unexpected AdaptiveCards.search() triggered for activity type: ${a?.type}`)
          }

          // Flatten search parameters
          const validatedQuery = validateValueSearchQuery(a.value)
          const query: Query<AdaptiveCardsSearchParams> = {
            count: validatedQuery.queryOptions?.top ?? 25,
            skip: validatedQuery.queryOptions?.skip ?? 0,
            parameters: {
              queryText: validatedQuery.queryText ?? '',
              dataset: validatedQuery.dataset ?? ''
            }
          }

          // Call handler and then check to see if an invoke response has already been added
          const results = await handler(context, state, query)
          if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
            // Format invoke response
            const response = {
              type: AdaptiveCardInvokeResponseType.SEARCH,
              value: {
                results
              }
            }

            // Queue up invoke response
            await context.sendActivity(Activity.fromObject({
              value: { body: response, status: 200 } as InvokeResponse,
              type: ActivityTypes.InvokeResponse
            }))
          }
        },
        true
      )
    })
    return this._app
  }
}

/**
 * @param {string | RegExp | RouteSelector} verb The named action to be handled, or a regular expression to match the verb.
 * @private
 * @returns {RouteSelector} A function that matches the verb using a RegExp or attempts to match verb.
 */
function createActionExecuteSelector (verb: string | RegExp | RouteSelector): RouteSelector {
  if (typeof verb === 'function') {
    // Return the passed in selector function
    return verb
  } else if (verb instanceof RegExp) {
    // Return a function that matches the verb using a RegExp
    return (context: TurnContext) => {
      const a = context?.activity
      const valueAction = validateValueActionExecuteSelector(a.value)
      const isInvoke =
                a?.type === ActivityTypes.Invoke &&
                a?.name === ACTION_INVOKE_NAME &&
                valueAction.action?.type === ACTION_EXECUTE_TYPE
      if (isInvoke && typeof valueAction.action.verb === 'string') {
        return Promise.resolve(verb.test(valueAction.action.verb))
      } else {
        return Promise.resolve(false)
      }
    }
  } else {
    // Return a function that attempts to match verb
    return (context: TurnContext) => {
      const a = context?.activity
      const valueAction = validateValueActionExecuteSelector(a.value)
      const isInvoke =
                a?.type === ActivityTypes.Invoke &&
                a?.name === ACTION_INVOKE_NAME &&
                valueAction.action?.type === ACTION_EXECUTE_TYPE
      if (isInvoke && valueAction.verb === verb) {
        return Promise.resolve(true)
      } else {
        return Promise.resolve(false)
      }
    }
  }
}

/**
 * @param {string | RegExp | RouteSelector} verb The named action to be handled, or a regular expression to match the verb.
 * @param {RouteSelector} filter Optional. A filter function to further refine the selection.
 * @private
 * @returns {RouteSelector} A function that matches the verb using a RegExp or attempts to match verb.
 */
function createActionSubmitSelector (verb: string | RegExp | RouteSelector, filter: string): RouteSelector {
  if (typeof verb === 'function') {
    // Return the passed in selector function
    return verb
  } else if (verb instanceof RegExp) {
    // Return a function that matches the verb using a RegExp
    return (context: TurnContext) => {
      const a = context?.activity
      const isSubmit = a?.type === ActivityTypes.Message && !a?.text && typeof a?.value === 'object'
      // @ts-ignore
      if (isSubmit && typeof a?.value[filter] === 'string') {
        // @ts-ignore
        return Promise.resolve(verb.test(a.value[filter]))
      } else {
        return Promise.resolve(false)
      }
    }
  } else {
    // Return a function that attempts to match verb
    return (context: TurnContext) => {
      const a = context?.activity
      const isSubmit = a?.type === ActivityTypes.Message && !a?.text && typeof a?.value === 'object'
      // @ts-ignore
      return Promise.resolve(isSubmit && a?.value[filter] === verb)
    }
  }
}

/**
 * Creates a route selector function for handling Adaptive Card Search.Invoke events.
 * @param {string | RegExp | RouteSelector} dataset The dataset to match, or a regular expression to match the dataset.
 * @private
 * @returns {RouteSelector} A function that matches the dataset using a RegExp or attempts to match dataset.
 */
function createSearchSelector (dataset: string | RegExp | RouteSelector): RouteSelector {
  if (typeof dataset === 'function') {
    // Return the passed in selector function
    return dataset
  } else if (dataset instanceof RegExp) {
    // Return a function that matches the dataset using a RegExp
    return (context: TurnContext) => {
      const a = context?.activity
      const valueDataset = validateValueDataset(a.value)
      const isSearch = a?.type === ActivityTypes.Invoke && a?.name === SEARCH_INVOKE_NAME
      if (isSearch && typeof valueDataset.dataset === 'string') {
        return Promise.resolve(dataset.test(valueDataset.dataset))
      } else {
        return Promise.resolve(false)
      }
    }
  } else {
    // Return a function that attempts to match dataset
    return (context: TurnContext) => {
      const a = context?.activity
      const valueDataset = validateValueDataset(a.value)
      const isSearch = a?.type === ActivityTypes.Invoke && a?.name === SEARCH_INVOKE_NAME
      return Promise.resolve(isSearch && valueDataset.dataset === dataset)
    }
  }
}

/**
 * @param {TurnContext} context - The context of the current turn, providing information about the incoming activity and environment.
 * @param {AdaptiveCardInvokeResponse} response - The adaptive card invoke response to be sent.
 * @private
 */
async function sendInvokeResponse (context: TurnContext, response: AdaptiveCardInvokeResponse) {
  await context.sendActivity(Activity.fromObject({
    value: { body: response, status: 200 } as InvokeResponse,
    type: ActivityTypes.InvokeResponse
  }))
}
