// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { parseTeamsChannelData } from '../activity-extensions'
import type { O365ConnectorCardActionQuery } from '@microsoft/teams.api'
import { TeamsTurnContext } from '../teamsTurnContext'
import type { ReadReceiptInfo } from '../models/readReceiptInfo'
import { createTeamsRouteHandler, TeamsRouteHandler } from '../teamsRouteHandler'

type ExecuteActionRouteHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, query: O365ConnectorCardActionQuery) => Promise<void>
type ReadReceiptHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, data: ReadReceiptInfo) => Promise<void>

function equalsIgnoreCase (actual: unknown, expected: string): boolean {
  return typeof actual === 'string' && actual.toLowerCase() === expected.toLowerCase()
}

/**
 * Registers handlers for Microsoft Teams message lifecycle events.
 *
 * @typeParam TState - The turn state type used by the agent application.
 */
export class Message<TState extends TurnState = TurnState> {
  private _app: AgentApplication<TState>

  /**
   * Creates a Teams message route helper.
   *
   * @param app - The agent application that receives the registered routes.
   */
  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  /**
   * Registers a handler for Teams message edit events.
   *
   * @param handler - Handler invoked for matching message edit activities.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message helper for chaining.
   */
  onMessageEdit (handler: TeamsRouteHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.MessageUpdate &&
        context.activity.channelId === 'msteams' &&
        equalsIgnoreCase(channelData?.eventType, 'editMessage')
      )
    }
    this._app.addRoute(routeSel, createTeamsRouteHandler(handler), false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams soft-delete message events.
   *
   * @param handler - Handler invoked for matching message delete activities.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message helper for chaining.
   */
  onMessageDelete (handler: TeamsRouteHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.MessageDelete &&
        context.activity.channelId === 'msteams' &&
        equalsIgnoreCase(channelData?.eventType, 'softDeleteMessage')
      )
    }
    this._app.addRoute(routeSel, createTeamsRouteHandler(handler), false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams message undelete events.
   *
   * @param handler - Handler invoked for matching message update activities.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message helper for chaining.
   */
  onMessageUndelete (handler: TeamsRouteHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.MessageUpdate &&
        context.activity.channelId === 'msteams' &&
        equalsIgnoreCase(channelData?.eventType, 'undeleteMessage')
      )
    }
    this._app.addRoute(routeSel, createTeamsRouteHandler(handler), false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams read receipt events.
   *
   * @param handler - Handler invoked with read receipt information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message helper for chaining.
   */
  onReadReceipt (handler: ReadReceiptHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        equalsIgnoreCase(context.activity.name, 'application/vnd.microsoft.readReceipt')
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, context.activity.value as ReadReceiptInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Office 365 connector card execute action invokes.
   *
   * @param handler - Handler invoked with the connector card action query.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This message helper for chaining.
   */
  onExecuteAction (handler: ExecuteActionRouteHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        equalsIgnoreCase(context.activity.name, 'actionableMessage/executeAction')
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const query = (context.activity.value ?? {}) as O365ConnectorCardActionQuery
      await handler(new TeamsTurnContext(context), state, query)
      const invokeResponse = new Activity(ActivityTypes.InvokeResponse)
      invokeResponse.value = { status: 200 }
      await context.sendActivity(invokeResponse)
    }
    this._app.addRoute(routeSel, routeHandler, true, rank, authHandlers)
    return this
  }
}
