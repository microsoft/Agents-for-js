// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { parseTeamsChannelData } from '../activity-extensions'
import type { ChannelInfo } from '@microsoft/teams.api'
import { TeamsTurnContext } from '../teamsTurnContext'

const CHANNEL_CREATED_EVENT = 'channelCreated'
const CHANNEL_DELETED_EVENT = 'channelDeleted'
const CHANNEL_RENAMED_EVENT = 'channelRenamed'
const CHANNEL_RESTORED_EVENT = 'channelRestored'
const CHANNEL_SHARED_EVENT = 'channelShared'
const CHANNEL_UNSHARED_EVENT = 'channelUnshared'
const CHANNEL_MEMBER_ADDED_EVENT = 'channelMemberAdded'
const CHANNEL_MEMBER_REMOVED_EVENT = 'channelMemberRemoved'

type ChannelUpdateHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, data: ChannelInfo) => Promise<void>

function isChannelUpdateEvent (context: TurnContext, eventType?: string): boolean {
  const channelData = parseTeamsChannelData(context.activity.channelData)
  const actualEventType = typeof channelData?.eventType === 'string' ? channelData.eventType.toLowerCase() : undefined
  const expectedEventType = eventType?.toLowerCase()

  return (
    context.activity.type === ActivityTypes.ConversationUpdate &&
    context.activity.channelId === 'msteams' &&
    channelData?.channel != null &&
    (
      expectedEventType != null
        ? actualEventType === expectedEventType
        : actualEventType?.startsWith('channel') === true
    )
  )
}

function getChannelInfo (context: TurnContext): ChannelInfo {
  return parseTeamsChannelData(context.activity.channelData).channel as ChannelInfo
}

/**
 * Registers handlers for Microsoft Teams channel lifecycle and membership events.
 *
 * @typeParam TState - The turn state type used by the agent application.
 */
export class TeamsChannel<TState extends TurnState = TurnState> {
  private _app: AgentApplication<TState>

  /**
   * Creates a Teams channel route helper.
   *
   * @param app - The agent application that receives the registered routes.
   */
  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  /**
   * Registers a handler for any Teams channel update event.
   *
   * @param handler - Handler invoked with the Teams turn context, turn state, and channel information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This channel helper for chaining.
   */
  onChannelEventReceived (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isChannelUpdateEvent(context))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getChannelInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams channel created events.
   *
   * @param handler - Handler invoked with the created channel information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This channel helper for chaining.
   */
  onCreated (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isChannelUpdateEvent(context, CHANNEL_CREATED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getChannelInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams channel deleted events.
   *
   * @param handler - Handler invoked with the deleted channel information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This channel helper for chaining.
   */
  onDeleted (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isChannelUpdateEvent(context, CHANNEL_DELETED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getChannelInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams channel renamed events.
   *
   * @param handler - Handler invoked with the renamed channel information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This channel helper for chaining.
   */
  onRenamed (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isChannelUpdateEvent(context, CHANNEL_RENAMED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getChannelInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams channel restored events.
   *
   * @param handler - Handler invoked with the restored channel information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This channel helper for chaining.
   */
  onRestored (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isChannelUpdateEvent(context, CHANNEL_RESTORED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getChannelInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams channel shared events.
   *
   * @param handler - Handler invoked with the shared channel information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This channel helper for chaining.
   */
  onShared (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isChannelUpdateEvent(context, CHANNEL_SHARED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getChannelInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams channel unshared events.
   *
   * @param handler - Handler invoked with the unshared channel information.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This channel helper for chaining.
   */
  onUnshared (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isChannelUpdateEvent(context, CHANNEL_UNSHARED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getChannelInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for member-added events in a Teams channel.
   *
   * @param handler - Handler invoked with channel information for the membership event.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This channel helper for chaining.
   */
  onMemberAdded (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isChannelUpdateEvent(context, CHANNEL_MEMBER_ADDED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getChannelInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for member-removed events in a Teams channel.
   *
   * @param handler - Handler invoked with channel information for the membership event.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This channel helper for chaining.
   */
  onMemberRemoved (handler: ChannelUpdateHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isChannelUpdateEvent(context, CHANNEL_MEMBER_REMOVED_EVENT))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      await handler(new TeamsTurnContext(context), state, getChannelInfo(context))
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }
}
