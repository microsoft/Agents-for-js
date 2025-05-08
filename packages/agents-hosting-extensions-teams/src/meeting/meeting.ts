import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, RouteHandler, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'

/**
 * Class that exposes all Teams meeting-related events.
 * Provides an organized way to handle meeting events in Microsoft Teams.
 */
export class Meeting {
  private _app: AgentApplication<TurnState>

  /**
   * Creates a new instance of the Meetings class.
   * @param app - The agent application
   */
  constructor (app: AgentApplication<TurnState>) {
    this._app = app
  }

  /**
   * Triggered when a meeting starts.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onMeetingStart (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingStart'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Triggered when a meeting ends.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onMeetingEnd (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingEnd'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Triggered when participants join a meeting.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onParticipantsJoin (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingParticipantJoin'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Triggered when participants leave a meeting.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onParticipantsLeave (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingParticipantLeave'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Triggered when a physical meeting room joins a Teams meeting.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onRoomJoin (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingRoomJoin'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Triggered when a physical meeting room leaves a Teams meeting.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onRoomLeave (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingRoomLeave'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Triggered when your app is viewed in the meeting stage.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onStageView (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingStageView'
      )
    }
    this._app.addRoute(routeSel, handler)// This is an invoke so true
    return this
  }

  /**
   * Processes smart reply recommendations during meetings.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onSmartReply (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingSmartReply'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Captures emoji reactions during meetings.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onReaction (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingReaction'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Processes responses to polls during meetings.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onPollResponse (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingPollResponse'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Notifies when apps are installed during a meeting.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onAppsInstalled (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingAppsInstalled'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Notifies when apps are removed during a meeting.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onAppsUninstalled (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingAppsUninstalled'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Triggered when a meeting is recorded.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onRecordingStarted (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingRecordingStarted'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Triggered when recording is stopped in a meeting.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onRecordingStopped (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingRecordingStopped'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Triggered when the focus of the meeting changes.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onFocusChange (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingFocusChange'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Triggered when screen sharing starts in a meeting.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onScreenShareStart (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingScreenShareStart'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }

  /**
   * Triggered when screen sharing stops in a meeting.
   * @param handler - The handler to call when this event occurs
   * @returns this (for method chaining)
   */
  onScreenShareStop (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Event &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'application/vnd.microsoft.meetingScreenShareStop'
      )
    }
    this._app.addRoute(routeSel, handler)
    return this
  }
}
