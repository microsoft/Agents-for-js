// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import type { FileConsentCardResponse } from '@microsoft/teams.api'
import { TeamsTurnContext } from '../teamsTurnContext'

type FileConsentHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, response: FileConsentCardResponse) => Promise<void>

function isFileConsentAction (context: TurnContext, action: 'accept' | 'decline'): boolean {
  const activityAction = (context.activity.value as any)?.action
  return (
    context.activity.type === ActivityTypes.Invoke &&
    context.activity.channelId === 'msteams' &&
    typeof context.activity.name === 'string' &&
    context.activity.name.toLowerCase() === 'fileconsent/invoke' &&
    typeof activityAction === 'string' &&
    activityAction.toLowerCase() === action
  )
}

/**
 * Registers handlers for Microsoft Teams file consent card actions.
 *
 * @typeParam TState - The turn state type used by the agent application.
 */
export class FileConsent<TState extends TurnState = TurnState> {
  private _app: AgentApplication<TState>

  /**
   * Creates a Teams file consent route helper.
   *
   * @param app - The agent application that receives the registered routes.
   */
  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  /**
   * Registers a handler for accepted file consent cards.
   *
   * @param handler - Handler invoked with the file consent card response.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This file consent helper for chaining.
   */
  onAccept (handler: FileConsentHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isFileConsentAction(context, 'accept'))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const cardResponse = context.activity.value as FileConsentCardResponse
      await handler(new TeamsTurnContext(context), state, cardResponse)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200 }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for declined file consent cards.
   *
   * @param handler - Handler invoked with the file consent card response.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This file consent helper for chaining.
   */
  onDecline (handler: FileConsentHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isFileConsentAction(context, 'decline'))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const cardResponse = context.activity.value as FileConsentCardResponse
      await handler(new TeamsTurnContext(context), state, cardResponse)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200 }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }
}
