// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { parseTeamsChannelData } from '../activity-extensions'
import { ChannelInfo } from '@microsoft/teams.api'

const CHANNEL_EVENT_TYPES = ['channelCreated', 'channelDeleted', 'channelRenamed', 'channelRestored', 'channelShared', 'channelUnshared']

type ChannelUpdateHandler<TState extends TurnState> = (context: TurnContext, state: TState, data: ChannelInfo) => Promise<void>

export class TeamsChannel<TState extends TurnState = TurnState> {
  private _app: AgentApplication<TState>

  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  onChannelEventReceived (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        !!channelData?.eventType &&
        CHANNEL_EVENT_TYPES.includes(channelData.eventType as string)
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const channelInfo = parseTeamsChannelData(context.activity.channelData)?.channel
      await handler(context, state, channelInfo ?? {} as ChannelInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onCreated (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'channelCreated'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const channelInfo = parseTeamsChannelData(context.activity.channelData)?.channel
      await handler(context, state, channelInfo ?? {} as ChannelInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onDeleted (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'channelDeleted'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const channelInfo = parseTeamsChannelData(context.activity.channelData)?.channel
      await handler(context, state, channelInfo ?? {} as ChannelInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onRenamed (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'channelRenamed'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const channelInfo = parseTeamsChannelData(context.activity.channelData)?.channel
      await handler(context, state, channelInfo ?? {} as ChannelInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onRestored (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'channelRestored'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const channelInfo = parseTeamsChannelData(context.activity.channelData)?.channel
      await handler(context, state, channelInfo ?? {} as ChannelInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onShared (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'channelShared'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const channelInfo = parseTeamsChannelData(context.activity.channelData)?.channel
      await handler(context, state, channelInfo ?? {} as ChannelInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onUnshared (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        channelData?.eventType === 'channelUnshared'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const channelInfo = parseTeamsChannelData(context.activity.channelData)?.channel
      await handler(context, state, channelInfo ?? {} as ChannelInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onMemberAdded (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        !!context.activity.membersAdded &&
        context.activity.membersAdded.length > 0
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const channelInfo = parseTeamsChannelData(context.activity.channelData)?.channel
      await handler(context, state, channelInfo ?? {} as ChannelInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onMemberRemoved (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.ConversationUpdate &&
        context.activity.channelId === 'msteams' &&
        !!context.activity.membersRemoved &&
        context.activity.membersRemoved.length > 0
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const channelInfo = parseTeamsChannelData(context.activity.channelData)?.channel
      await handler(context, state, channelInfo ?? {} as ChannelInfo)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }
}
