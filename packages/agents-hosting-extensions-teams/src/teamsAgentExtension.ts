import { Meeting } from './meeting/meeting'
import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, AgentExtension, RouteHandler, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { parseTeamsChannelData } from './activity-extensions/teamsChannelDataParser'
import { MessageExtension } from './messageExtension/messageExtension'
import { TaskModule } from './taskModule/taskModule'

/**
 * Microsoft Teams-specific extension for agent applications that provides event handlers and functionality
 * for Teams-specific activities such as message operations, member management, channel operations, and team lifecycle events.
 * @template TState The type of turn state, extending TurnState
 */
export class TeamsAgentExtension<TState extends TurnState = TurnState> extends AgentExtension<TState> {
  _app: AgentApplication<TState>
  _meeting: Meeting<TState>
  _messageExtension: MessageExtension<TState>
  _taskModule: TaskModule<TState>

  /**
   * Creates a new instance of TeamsAgentExtension.
   * @param app The agent application instance to extend with Teams functionality
   */
  constructor (private app: AgentApplication<TState>) {
    super('msteams')
    this._app = app
    this._meeting = new Meeting(app)
    this._messageExtension = new MessageExtension(app)
    this._taskModule = new TaskModule(app)
  }

  /**
   * Gets the meeting functionality for handling Teams meeting-related activities.
   * @returns The Meeting instance for this extension
   */
  public get meeting (): Meeting<TState> {
    return this._meeting
  }

  /**
   * Gets the message extension functionality for handling Teams message extension activities.
   * @returns The MessageExtension instance for this extension
   */
  public get messageExtension (): MessageExtension<TState> {
    return this._messageExtension
  }

  /**
   * Gets the task module functionality for handling Teams task module activities.
   * @returns The TaskModule instance for this extension
   */
  public get taskModule (): TaskModule<TState> {
    return this._taskModule
  }

  /**
   * Registers a handler for message edit events in Teams.
   * @param handler The route handler to execute when a message is edited
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onMessageEdit = (handler: RouteHandler<TurnState>) => {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(!!(context.activity.type === ActivityTypes.MessageUpdate && channelData?.eventType === 'editMessage'))
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for message delete events in Teams.
   * @param handler The route handler to execute when a message is deleted
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onMessageDelete = (handler: RouteHandler<TurnState>) => {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.MessageDelete && channelData && channelData.eventType === 'softDeleteMessage')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for message undelete events in Teams.
   * @param handler The route handler to execute when a message is undeleted
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onMessageUndelete = (handler: RouteHandler<TurnState>) => {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.MessageUpdate && channelData && channelData.eventType === 'undeleteMessage')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  /**
   * Registers a handler for when members are added to a Teams conversation.
   * @param handler The route handler to execute when members are added
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsMembersAdded = (handler: RouteHandler<TurnState>) => {
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
   * Registers a handler for when members are removed from a Teams conversation.
   * @param handler The route handler to execute when members are removed
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsMembersRemoved = (handler: RouteHandler<TurnState>) => {
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
   * Registers a handler for when a Teams channel is created.
   * @param handler The route handler to execute when a channel is created
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsChannelCreated = (handler: RouteHandler<TurnState>) => {
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
   * Registers a handler for when a Teams channel is deleted.
   * @param handler The route handler to execute when a channel is deleted
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsChannelDeleted = (handler: RouteHandler<TurnState>) => {
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
   * Registers a handler for when a Teams channel is renamed.
   * @param handler The route handler to execute when a channel is renamed
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsChannelRenamed = (handler: RouteHandler<TurnState>) => {
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
   * Registers a handler for when a Teams channel is restored.
   * @param handler The route handler to execute when a channel is restored
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsChannelRestored = (handler: RouteHandler<TurnState>) => {
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
   * Registers a handler for when a Teams team is renamed.
   * @param handler The route handler to execute when a team is renamed
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsTeamRenamed = (handler: RouteHandler<TurnState>) => {
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
   * Registers a handler for when a Teams team is archived.
   * @param handler The route handler to execute when a team is archived
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsTeamArchived = (handler: RouteHandler<TurnState>) => {
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
   * Registers a handler for when a Teams team is unarchived.
   * @param handler The route handler to execute when a team is unarchived
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsTeamUnarchived = (handler: RouteHandler<TurnState>) => {
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
   * Registers a handler for when a Teams team is deleted (soft delete).
   * @param handler The route handler to execute when a team is deleted
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsTeamDeleted = (handler: RouteHandler<TurnState>) => {
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
   * Registers a handler for when a Teams team is hard deleted (permanently deleted).
   * @param handler The route handler to execute when a team is hard deleted
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsTeamHardDeleted = (handler: RouteHandler<TurnState>) => {
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
   * Registers a handler for when a Teams team is restored.
   * @param handler The route handler to execute when a team is restored
   * @returns This TeamsAgentExtension instance for method chaining
   */
  onTeamsTeamRestored = (handler: RouteHandler<TurnState>) => {
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
