// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteRank, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import type { IMeetingParticipantJoinEventActivity, IMeetingParticipantLeaveEventActivity, MeetingDetails } from '@microsoft/teams.api'
import { TeamsTurnContext } from '../teamsTurnContext'

/** Details provided by a Teams meeting participant join event. */
export type MeetingParticipantJoinValue = IMeetingParticipantJoinEventActivity['value']

/** Details provided by a Teams meeting participant leave event. */
export type MeetingParticipantLeaveValue = IMeetingParticipantLeaveEventActivity['value']

type MeetingStartHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, details: MeetingDetails) => Promise<void>
type MeetingEndHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, details: MeetingDetails) => Promise<void>
type MeetingParticipantsJoinHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, details: MeetingParticipantJoinValue) => Promise<void>
type MeetingParticipantsLeaveHandler<TState extends TurnState> = (context: TeamsTurnContext, state: TState, details: MeetingParticipantLeaveValue) => Promise<void>

function isMeetingEvent (context: TurnContext, eventName: string): boolean {
  return (
    context.activity.type === ActivityTypes.Event &&
    context.activity.channelId === 'msteams' &&
    typeof context.activity.name === 'string' &&
    context.activity.name.toLowerCase() === eventName.toLowerCase()
  )
}

/**
 * Registers handlers for Microsoft Teams meeting events.
 *
 * @typeParam TState - The turn state type used by the agent application.
 */
export class Meeting<TState extends TurnState> {
  private _app: AgentApplication<TState>

  /**
   * Creates a Teams meeting route helper.
   *
   * @param app - The agent application that receives the registered routes.
   */
  constructor (app: AgentApplication<TState>) {
    this._app = app
  }

  /**
   * Registers a handler for Teams meeting start events.
   *
   * @param handler - Handler invoked with meeting details.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This meeting helper for chaining.
   */
  onStart (handler: MeetingStartHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isMeetingEvent(context, 'application/vnd.microsoft.meetingStart'))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const details = context.activity.value as MeetingDetails
      await handler(new TeamsTurnContext(context), state, details)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams meeting end events.
   *
   * @param handler - Handler invoked with meeting details.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This meeting helper for chaining.
   */
  onEnd (handler: MeetingEndHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isMeetingEvent(context, 'application/vnd.microsoft.meetingEnd'))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const details = context.activity.value as MeetingDetails
      await handler(new TeamsTurnContext(context), state, details)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams meeting participant join events.
   *
   * @param handler - Handler invoked with participant event details.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This meeting helper for chaining.
   */
  onParticipantsJoin (handler: MeetingParticipantsJoinHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isMeetingEvent(context, 'application/vnd.microsoft.meetingParticipantJoin'))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const details = context.activity.value as MeetingParticipantJoinValue
      await handler(new TeamsTurnContext(context), state, details)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }

  /**
   * Registers a handler for Teams meeting participant leave events.
   *
   * @param handler - Handler invoked with participant event details.
   * @param rank - Optional route rank used for route ordering.
   * @param authHandlers - Optional authorization handlers required by the route.
   * @returns This meeting helper for chaining.
   */
  onParticipantsLeave (handler: MeetingParticipantsLeaveHandler<TState>, rank: number = RouteRank.Unspecified, authHandlers: string[] = []) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(isMeetingEvent(context, 'application/vnd.microsoft.meetingParticipantLeave'))
    }
    const routeHandler: RouteHandler<TState> = async (context: TurnContext, state: TState) => {
      const details = context.activity.value as MeetingParticipantLeaveValue
      await handler(new TeamsTurnContext(context), state, details)
    }
    this._app.addRoute(routeSel, routeHandler, false, rank, authHandlers)
    return this
  }
}
