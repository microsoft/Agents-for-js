// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { parseTeamsChannelData } from '../activity-extensions'
import type { TeamInfo } from '@microsoft/teams.api'
import { TeamsTurnContext } from '../teamsTurnContext'

const TEAM_ARCHIVED_EVENT = 'teamArchived'
const TEAM_UNARCHIVED_EVENT = 'teamUnarchived'
const TEAM_RENAMED_EVENT = 'teamRenamed'
const TEAM_RESTORED_EVENT = 'teamRestored'
const TEAM_DELETED_EVENT = 'teamDeleted'
const TEAM_HARD_DELETED_EVENT = 'teamHardDeleted'

type TeamUpdateHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, data: TeamInfo) => Promise<void>

function isTeamUpdateEvent (context: TurnContext, eventType?: string): boolean {
  const channelData = parseTeamsChannelData(context.activity.channelData)
  const actualEventType = typeof channelData?.eventType === 'string' ? channelData.eventType.toLowerCase() : undefined
  const expectedEventType = eventType?.toLowerCase()

  return (
    context.activity.type === ActivityTypes.ConversationUpdate &&
    context.activity.channelId === 'msteams' &&
    channelData?.team != null &&
    (
      expectedEventType != null
        ? actualEventType === expectedEventType
        : actualEventType?.startsWith('team') === true
    )
  )
}

function getTeamInfo (context: TurnContext): TeamInfo {
  return parseTeamsChannelData(context.activity.channelData).team as TeamInfo
}

/**
 * Registers handlers for Microsoft Teams team lifecycle events.
 *
 * @typeParam TState - The turn state type used by the agent application.
 */
export class TeamsTeam<TState extends TurnState = TurnState> {
  private _app: AgentApplication<TState>

  /**
   * Creates a Teams team route helper.
   *
   * @param app - The agent application that receives the registered routes.
   */
  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  /**
   * Registers a handler for any Teams team update event.
   *
   * @param handler - Handler invoked with the Teams turn context, turn state, and team information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This team helper for chaining.
   */
  onTeamEventReceived (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isTeamUpdateEvent(context))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getTeamInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams team archived events.
   *
   * @param handler - Handler invoked with the archived team information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This team helper for chaining.
   */
  onArchived (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isTeamUpdateEvent(context, TEAM_ARCHIVED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getTeamInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams team unarchived events.
   *
   * @param handler - Handler invoked with the unarchived team information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This team helper for chaining.
   */
  onUnarchived (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isTeamUpdateEvent(context, TEAM_UNARCHIVED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getTeamInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams team renamed events.
   *
   * @param handler - Handler invoked with the renamed team information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This team helper for chaining.
   */
  onRenamed (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isTeamUpdateEvent(context, TEAM_RENAMED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getTeamInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams team restored events.
   *
   * @param handler - Handler invoked with the restored team information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This team helper for chaining.
   */
  onRestored (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isTeamUpdateEvent(context, TEAM_RESTORED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getTeamInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams team deleted events.
   *
   * @param handler - Handler invoked with the deleted team information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This team helper for chaining.
   */
  onDeleted (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isTeamUpdateEvent(context, TEAM_DELETED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getTeamInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams team hard-deleted events.
   *
   * @param handler - Handler invoked with the hard-deleted team information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This team helper for chaining.
   */
  onHardDeleted (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isTeamUpdateEvent(context, TEAM_HARD_DELETED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getTeamInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }
}
