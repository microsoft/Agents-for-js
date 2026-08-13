// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import type { ConfigResponse } from '@microsoft/teams.api'
import { TeamsTurnContext } from '../teamsTurnContext'

type ConfigHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, configData: unknown) => Promise<ConfigResponse>

/**
 * Registers handlers for Microsoft Teams app configuration invokes.
 *
 * @typeParam TState - The turn state type used by the agent application.
 */
export class TeamsConfig<TState extends TurnState = TurnState> {
  private _app: AgentApplication<TState>

  /**
   * Creates a Teams configuration route helper.
   *
   * @param app - The agent application that receives the registered routes.
   */
  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  /**
   * Registers a handler for Teams config/fetch invokes.
   *
   * @param handler - Handler invoked with the config fetch payload.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This config helper for chaining.
   */
  onConfigFetch (handler: ConfigHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'config/fetch'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const response: ConfigResponse = await handler(new TeamsTurnContext(context), state, context.activity.value)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams config/submit invokes.
   *
   * @param handler - Handler invoked with the config submit payload.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This config helper for chaining.
   */
  onConfigSubmit (handler: ConfigHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'config/submit'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const response: ConfigResponse = await handler(new TeamsTurnContext(context), state, context.activity.value)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200, body: response }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }
}
