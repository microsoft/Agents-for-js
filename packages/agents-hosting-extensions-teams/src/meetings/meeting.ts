// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import type { MeetingDetails, TeamsChannelAccount } from '@microsoft/teams.api'

export interface MeetingParticipantsEventDetails {
  members: {
    user: TeamsChannelAccount
    meeting: {
      inMeeting: boolean
      role: string
    }
  }[]
}

type MeetingStartHandler<TState extends TurnState> = (context: TurnContext, state: TState, details: MeetingDetails) => Promise<void>
type MeetingEndHandler<TState extends TurnState> = (context: TurnContext, state: TState, details: MeetingDetails) => Promise<void>
type MeetingParticipantsHandler<TState extends TurnState> = (context: TurnContext, state: TState, details: MeetingParticipantsEventDetails) => Promise<void>

export class Meeting<TState extends TurnState> {
  private _app: AgentApplication<TState>

  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  onStart (handler: MeetingStartHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingStart'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const details = context.activity.value as MeetingDetails
      await handler(context, state, details)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onEnd (handler: MeetingEndHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingEnd'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const details = context.activity.value as MeetingDetails
      await handler(context, state, details)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onParticipantsJoin (handler: MeetingParticipantsHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingParticipantJoin'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const details = context.activity.value as MeetingParticipantsEventDetails
      await handler(context, state, details)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  onParticipantsLeave (handler: MeetingParticipantsHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingParticipantLeave'
      )
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const details = context.activity.value as MeetingParticipantsEventDetails
      await handler(context, state, details)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }
}
