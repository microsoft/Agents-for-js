/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ActivityTypes } from '@microsoft/agents-activity'
import { TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsApplication } from '../teamsApplication'
import { MeetingParticipantsEventDetails } from '../../meeting/meetingParticipantsEventDetails'
import { MeetingEndEventDetails } from '../../meeting/meetingEndEventDetails'
import { MeetingStartEventDetails } from '../../meeting/meetingStartEventDetails'

/**
 * Handles Teams meeting-related events in applications.
 * Provides methods for registering handlers for meeting start, end, and participant changes.
 * @template TState Type extending TurnState to be used by the application
 */
export class Meetings<TState extends TurnState> {
  private readonly _app: TeamsApplication<TState>

  /**
   * Creates a new Meetings instance.
   * @param app The TeamsApplication instance to associate with this Meetings instance
   */
  public constructor (app: TeamsApplication<TState>) {
    this._app = app
  }

  /**
   * Registers a handler for meeting start events.
   * This event occurs when a Teams meeting begins.
   *
   * @param handler Function to handle the meeting start event
   * @returns The TeamsApplication instance for chaining
   */
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

  /**
   * Registers a handler for meeting end events.
   * This event occurs when a Teams meeting ends.
   *
   * @param handler Function to handle the meeting end event
   * @returns The TeamsApplication instance for chaining
   */
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

  /**
   * Registers a handler for participant join events.
   * This event occurs when participants join a Teams meeting.
   *
   * @param handler Function to handle the participants join event
   * @returns The TeamsApplication instance for chaining
   */
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

  /**
   * Registers a handler for participant leave events.
   * This event occurs when participants leave a Teams meeting.
   *
   * @param handler Function to handle the participants leave event
   * @returns The TeamsApplication instance for chaining
   */
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
