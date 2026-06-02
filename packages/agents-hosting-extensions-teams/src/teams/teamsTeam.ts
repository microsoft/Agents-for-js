// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { parseTeamsChannelData } from '../activity-extensions'
import { TeamInfo } from '@microsoft/teams.api'

const TEAM_EVENT_TYPES = ['teamArchived', 'teamUnarchived', 'teamRenamed', 'teamRestored', 'teamDeleted', 'teamHardDeleted']

type TeamUpdateHandler<TState extends TurnState> = (context: TurnContext, state: TState, data: TeamInfo) => Promise<void>

export class TeamsTeam<TState extends TurnState = TurnState> {
  private _app: AgentApplication<TState>

  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  onTeamEventReceived (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        !!channelData?.eventType &&
        TEAM_EVENT_TYPES.includes(channelData.eventType as string)
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const teamInfo = parseTeamsChannelData(context.activity.channelData)?.team
      await handler(context, state, teamInfo ?? {} as TeamInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onArchived (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'teamArchived'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const teamInfo = parseTeamsChannelData(context.activity.channelData)?.team
      await handler(context, state, teamInfo ?? {} as TeamInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onUnarchived (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'teamUnarchived'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const teamInfo = parseTeamsChannelData(context.activity.channelData)?.team
      await handler(context, state, teamInfo ?? {} as TeamInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onRenamed (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'teamRenamed'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const teamInfo = parseTeamsChannelData(context.activity.channelData)?.team
      await handler(context, state, teamInfo ?? {} as TeamInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onRestored (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'teamRestored'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const teamInfo = parseTeamsChannelData(context.activity.channelData)?.team
      await handler(context, state, teamInfo ?? {} as TeamInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onDeleted (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'teamDeleted'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const teamInfo = parseTeamsChannelData(context.activity.channelData)?.team
      await handler(context, state, teamInfo ?? {} as TeamInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onHardDeleted (handler: TeamUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'teamHardDeleted'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const teamInfo = parseTeamsChannelData(context.activity.channelData)?.team
      await handler(context, state, teamInfo ?? {} as TeamInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }
}
