import { Meeting } from './meeting/meeting'
import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, AgentExtension, RouteHandler, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { parseTeamsChannelData } from './activity-extensions/teamsChannelDataParser'
import { MessageExtension } from './messageExtension/messageExtension'
import { TaskModule } from './taskModule/taskModule'
import { FeedbackLoopData } from './feedbackLoopData'

export class TeamsAgentExtension<TState extends TurnState = TurnState> extends AgentExtension<TState> {
  private _app: AgentApplication<TState>
  private _meeting: Meeting<TState>
  private _messageExtension: MessageExtension<TState>
  private _taskModule: TaskModule<TState>
  constructor (app: AgentApplication<TState>) {
    super('msteams')
    this._app = app
    this._meeting = new Meeting(app)
    this._messageExtension = new MessageExtension(app)
    this._taskModule = new TaskModule(app)
  }

  /** Gets the meeting event registration surface. */
  public get meeting (): Meeting<TState> {
    return this._meeting
  }

  /** Gets the messaging extension registration surface. */
  public get messageExtension (): MessageExtension<TState> {
    return this._messageExtension
  }

  /** Gets the task module registration surface. */
  public get taskModule (): TaskModule<TState> {
    return this._taskModule
  }

  /**
   * Registers a handler for Teams feedback submissions.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onFeedback (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(
        context.activity.type === ActivityTypes.Invoke &&
        context.activity.channelId === 'msteams' &&
        context.activity.name === 'message/submitAction' &&
        (context.activity.value as FeedbackLoopData).actionName === 'feedback'
      )
    }
    this._app.addRoute(routeSel, handler, true) // Invoke requires true
    return this
  }

  /**
   * Registers a handler for edited Teams messages.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onMessageEdit (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(!!(context.activity.type === ActivityTypes.MessageUpdate && channelData?.eventType === 'editMessage'))
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for deleted Teams messages.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onMessageDelete (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.MessageDelete && channelData && channelData.eventType === 'softDeleteMessage')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for restored Teams messages.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onMessageUndelete (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.MessageUpdate && channelData && channelData.eventType === 'undeleteMessage')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for members added to a Teams conversation.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsMembersAdded (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(!!(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                context.activity.membersAdded &&
                context.activity.membersAdded.length > 0))
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for members removed from a Teams conversation.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsMembersRemoved (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      return Promise.resolve(!!(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                context.activity.membersRemoved &&
                context.activity.membersRemoved.length > 0))
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams channel creation events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsChannelCreated (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'channelCreated')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams channel deletion events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsChannelDeleted (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'channelDeleted')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams channel rename events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsChannelRenamed (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'channelRenamed')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams channel restoration events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsChannelRestored (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'channelRestored')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams channel sharing events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsChannelShared (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'channelShared')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams channel unsharing events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsChannelUnshared (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'channelUnshared')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams team rename events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsTeamRenamed (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'teamRenamed')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams team archival events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsTeamArchived (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'teamArchived')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams team unarchival events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsTeamUnarchived (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'teamUnarchived')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams team deletion events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsTeamDeleted (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'teamDeleted')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams team hard-deletion events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsTeamHardDeleted (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'teamHardDeleted')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for Teams team restoration events.
   *
   * @param handler The route handler to invoke.
   * @returns This extension for chaining.
   */
  onTeamsTeamRestored (handler: RouteHandler<TurnState>) {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.ConversationUpdate &&
                context.activity.channelId === 'msteams' &&
                channelData &&
                channelData.eventType === 'teamRestored')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }
}
