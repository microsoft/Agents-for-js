import { Meeting } from './meeting/meeting'
import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, AgentExtension, RouteHandler, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { parseTeamsChannelData } from './activity-extensions/teamsChannelDataParser'
import { MessageExtension } from './messageExtension/messageExtension'
import { TaskModule } from './taskModule/taskModule'

export class TeamsAgentExtension<TState extends TurnState> extends AgentExtension<TState> {
  _app: AgentApplication<TState>
  _meeting: Meeting<TState>
  _messageExtension: MessageExtension<TState>
  _taskModule: TaskModule<TState>
  constructor (private app: AgentApplication<TState>) {
    super('msteams')
    this._app = app
    this._meeting = new Meeting(app)
    this._messageExtension = new MessageExtension(app)
    this._taskModule = new TaskModule(app)
  }

  public get meeting (): Meeting<TState> {
    return this._meeting
  }

  public get messageExtension (): MessageExtension<TState> {
    return this._messageExtension
  }

  public get taskModule (): TaskModule<TState> {
    return this._taskModule
  }

  onMessageEdit = (handler: RouteHandler<TurnState>) => {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(!!(context.activity.type === ActivityTypes.MessageUpdate && channelData?.eventType === 'editMessage'))
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  onMessageDelete = (handler: RouteHandler<TurnState>) => {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.MessageDelete && channelData && channelData.eventType === 'softDeleteMessage')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

  onMessageUndelete = (handler: RouteHandler<TurnState>) => {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.MessageUpdate && channelData && channelData.eventType === 'undeleteMessage')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }

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
