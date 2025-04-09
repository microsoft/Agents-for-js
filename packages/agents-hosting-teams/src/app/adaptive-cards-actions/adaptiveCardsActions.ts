/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AdaptiveCardInvokeResponse, CardFactory, INVOKE_RESPONSE_KEY, InvokeResponse, MessageFactory, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { AdaptiveCard } from './adaptiveCard'
import { TeamsApplication } from '../teamsApplication'
import { AdaptiveCardActionExecuteResponseType } from './adaptiveCardActionExecuteResponseType'
import { AdaptiveCardInvokeResponseType } from './adaptiveCardInvokeResponseType'
import { AdaptiveCardSearchResult } from './adaptiveCardSearchResult'
import { parseAdaptiveCardInvokeAction, parseValueActionExecuteSelector, parseValueDataset, parseValueSearchQuery } from '../../parsers'
import { Query } from '../query'
import { AdaptiveCardsSearchParams } from '../../adaptive-cards'

export const ACTION_INVOKE_NAME = 'adaptiveCard/action'
const ACTION_EXECUTE_TYPE = 'Action.Execute'
const DEFAULT_ACTION_SUBMIT_FILTER = 'verb'
const SEARCH_INVOKE_NAME = 'application/search'

export class AdaptiveCardsActions<TState extends TurnState> {
  private readonly _app: TeamsApplication<TState>

  public constructor (app: TeamsApplication<TState>) {
    this._app = app
  }

  public actionExecute<TData = Record<string, any>>(
    verb: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState, data: TData) => Promise<AdaptiveCard | string>
  ): TeamsApplication<TState> {
    let actionExecuteResponseType =
            this._app.teamsOptions.adaptiveCards?.actionExecuteResponseType ??
            AdaptiveCardActionExecuteResponseType.REPLACE_FOR_INTERACTOR;
    (Array.isArray(verb) ? verb : [verb]).forEach((v) => {
      const selector = createActionExecuteSelector(v)
      this._app.addRoute(
        selector,
        async (context, state) => {
          const a = context?.activity
          const invokeAction = parseValueActionExecuteSelector(a.value)
          if (
            a?.type !== ActivityTypes.Invoke ||
                        a?.name !== ACTION_INVOKE_NAME ||
                        (invokeAction.action.type !== ACTION_EXECUTE_TYPE)
          ) {
            throw new Error(
                            `Unexpected AdaptiveCards.actionExecute() triggered for activity type: ${invokeAction.action.type}`
            )
          }

          const result = await handler(context, state, (invokeAction.action as TData) ?? {} as TData)
          if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
            let response: AdaptiveCardInvokeResponse
            if (typeof result === 'string') {
              response = {
                statusCode: 200,
                type: AdaptiveCardInvokeResponseType.MESSAGE,
                value: result as any
              }
              await sendInvokeResponse(context, response)
            } else {
              if (
                result.refresh &&
                                actionExecuteResponseType !== AdaptiveCardActionExecuteResponseType.NEW_MESSAGE_FOR_ALL
              ) {
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

  public actionSubmit<TData = Record<string, any>>(
    verb: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (context: TurnContext, state: TState, data: TData) => Promise<void>
  ): TeamsApplication<TState> {
    const filter = this._app.teamsOptions.adaptiveCards?.actionSubmitFilter ?? DEFAULT_ACTION_SUBMIT_FILTER;
    (Array.isArray(verb) ? verb : [verb]).forEach((v) => {
      const selector = createActionSubmitSelector(v, filter)
      this._app.addRoute(selector, async (context, state) => {
        const a = context?.activity
        if (a?.type !== ActivityTypes.Message || a?.text || typeof a?.value !== 'object') {
          throw new Error(`Unexpected AdaptiveCards.actionSubmit() triggered for activity type: ${a?.type}`)
        }

        await handler(context, state as TState, (parseAdaptiveCardInvokeAction(a.value)).data as TData ?? {} as TData)
      })
    })
    return this._app
  }

  public search (
    dataset: string | RegExp | RouteSelector | (string | RegExp | RouteSelector)[],
    handler: (
      context: TurnContext,
      state: TState,
      query: Query<AdaptiveCardsSearchParams>
    ) => Promise<AdaptiveCardSearchResult[]>
  ): TeamsApplication<TState> {
    (Array.isArray(dataset) ? dataset : [dataset]).forEach((ds) => {
      const selector = createSearchSelector(ds)
      this._app.addRoute(
        selector,
        async (context, state) => {
          const a = context?.activity
          if (a?.type !== ActivityTypes.Invoke || a?.name !== SEARCH_INVOKE_NAME) {
            throw new Error(`Unexpected AdaptiveCards.search() triggered for activity type: ${a?.type}`)
          }

          const parsedQuery = parseValueSearchQuery(a.value)
          const query: Query<AdaptiveCardsSearchParams> = {
            count: parsedQuery.queryOptions?.top ?? 25,
            skip: parsedQuery.queryOptions?.skip ?? 0,

            parameters: {
              queryText: parsedQuery.queryText ?? '',
              dataset: parsedQuery.dataset ?? ''

            }
          }

          const results = await handler(context, state, query)
          if (!context.turnState.get(INVOKE_RESPONSE_KEY)) {
            const response = {
              type: AdaptiveCardInvokeResponseType.SEARCH,
              value: {
                results
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
}

function createActionExecuteSelector (verb: string | RegExp | RouteSelector): RouteSelector {
  if (typeof verb === 'function') {
    return verb
  } else if (verb instanceof RegExp) {
    return (context: TurnContext) => {
      const a = context?.activity
      const valueAction = parseValueActionExecuteSelector(a.value)
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
    return (context: TurnContext) => {
      const a = context?.activity
      const valueAction = parseValueActionExecuteSelector(a.value)
      const isInvoke =
                a?.type === ActivityTypes.Invoke &&
                a?.name === ACTION_INVOKE_NAME &&
                valueAction.action?.type === ACTION_EXECUTE_TYPE
      if (isInvoke && valueAction.action?.verb === verb) {
        return Promise.resolve(true)
      } else {
        return Promise.resolve(false)
      }
    }
  }
}

function createActionSubmitSelector (verb: string | RegExp | RouteSelector, filter: string): RouteSelector {
  if (typeof verb === 'function') {
    return verb
  } else if (verb instanceof RegExp) {
    return (context: TurnContext) => {
      const a = context?.activity
      const isSubmit = a?.type === ActivityTypes.Message && !a?.text && typeof a?.value === 'object'
      if (isSubmit && typeof (a?.value as any)[filter] === 'string') {
        return Promise.resolve(verb.test((a.value as any)[filter]))
      } else {
        return Promise.resolve(false)
      }
    }
  } else {
    return (context: TurnContext) => {
      const a = context?.activity
      const isSubmit = a?.type === ActivityTypes.Message && !a?.text && typeof a?.value === 'object'
      return Promise.resolve(isSubmit && (a?.value as any)[filter] === verb)
    }
  }
}

function createSearchSelector (dataset: string | RegExp | RouteSelector): RouteSelector {
  if (typeof dataset === 'function') {
    return dataset
  } else if (dataset instanceof RegExp) {
    return (context: TurnContext) => {
      const a = context?.activity
      const valueDataset = parseValueDataset(a.value)
      const isSearch = a?.type === ActivityTypes.Invoke && a?.name === SEARCH_INVOKE_NAME
      if (isSearch && typeof valueDataset.dataset === 'string') {
        return Promise.resolve(dataset.test(valueDataset.dataset))
      } else {
        return Promise.resolve(false)
      }
    }
  } else {
    return (context: TurnContext) => {
      const a = context?.activity
      const valueDataset = parseValueDataset(a.value)
      const isSearch = a?.type === ActivityTypes.Invoke && a?.name === SEARCH_INVOKE_NAME
      return Promise.resolve(isSearch && valueDataset.dataset === dataset)
    }
  }
}

async function sendInvokeResponse (context: TurnContext, response: AdaptiveCardInvokeResponse) {
  await context.sendActivity({
    value: { body: response, status: 200 } as InvokeResponse,
    type: ActivityTypes.InvokeResponse
  } as Activity)
}
