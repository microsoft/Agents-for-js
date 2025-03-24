/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ActivityTypes, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsApplication } from '../teamsApplication'
import { MeetingParticipantsEventDetails } from '../../meeting/meetingParticipantsEventDetails'
import { MeetingEndEventDetails } from '../../meeting/meetingEndEventDetails'
import { MeetingStartEventDetails } from '../../meeting/meetingStartEventDetails'

export class Meetings<TState extends TurnState> {
  private readonly _app: TeamsApplication<TState>

  public constructor (app: TeamsApplication<TState>) {
    this._app = app
  }

  public start (
    handler: (context: TurnContext, state: TState, meeting: MeetingStartEventDetails) => Promise<void>
  ): TeamsApplication<TState> {
    const selector = (context: TurnContext): Promise<boolean> => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
                    context.activity.channelId === 'msteams' &&
                    context.activity.name === 'application/vnd.microsoft.meetingStart'
      )
    }

    const handlerWrapper = (context: TurnContext, state: TState): Promise<void> => {
      const meeting = context.activity.value as MeetingStartEventDetails
      return handler(context, state, meeting)
    }

    this._app.addRoute(selector, handlerWrapper)

    return this._app
  }

  public end (
    handler: (context: TurnContext, state: TState, meeting: MeetingEndEventDetails) => Promise<void>
  ): TeamsApplication<TState> {
    const selector = (context: TurnContext): Promise<boolean> => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
                    context.activity.channelId === 'msteams' &&
                    context.activity.name === 'application/vnd.microsoft.meetingEnd'
      )
    }

    const handlerWrapper = (context: TurnContext, state: TState): Promise<void> => {
      const meeting = context.activity.value as MeetingEndEventDetails
      return handler(context, state, meeting)
    }

    this._app.addRoute(selector, handlerWrapper)

    return this._app
  }

  public participantsJoin (
    handler: (context: TurnContext, state: TState, meeting: MeetingParticipantsEventDetails) => Promise<void>
  ): TeamsApplication<TState> {
    const selector = (context: TurnContext): Promise<boolean> => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
                    context.activity.channelId === 'msteams' &&
                    context.activity.name === 'application/vnd.microsoft.meetingParticipantsJoin'
      )
    }

    const handlerWrapper = (context: TurnContext, state: TState): Promise<void> => {
      const meeting = context.activity.value as MeetingParticipantsEventDetails
      return handler(context, state, meeting)
    }

    this._app.addRoute(selector, handlerWrapper)

    return this._app
  }

  public participantsLeave (
    handler: (context: TurnContext, state: TState, meeting: MeetingParticipantsEventDetails) => Promise<void>
  ): TeamsApplication<TState> {
    const selector = (context: TurnContext): Promise<boolean> => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
                    context.activity.channelId === 'msteams' &&
                    context.activity.name === 'application/vnd.microsoft.meetingParticipantsLeave'
      )
    }

    const handlerWrapper = (context: TurnContext, state: TState): Promise<void> => {
      const meeting = context.activity.value as MeetingParticipantsEventDetails
      return handler(context, state, meeting)
    }

    this._app.addRoute(selector, handlerWrapper)

    return this._app
  }
}
