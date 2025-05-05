import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, AgentExtension, RouteHandler, RouteSelector, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { parseTeamsChannelData } from './activity-extensions/teamsChannelDataParser'

export class MyTeamsExt extends AgentExtension {
  _app: AgentApplication<TurnState>
  constructor (private app: AgentApplication<TurnState>) {
    super('msteams')
    this._app = app
  }

  onMessageEdit = (handler: RouteHandler<TurnState>) => {
    const routeSel: RouteSelector = (context: TurnContext) => {
      const channelData = parseTeamsChannelData(context.activity.channelData)
      return Promise.resolve(context.activity.type === ActivityTypes.MessageUpdate && channelData && channelData.eventType === 'editMessage')
    }
    this.addRoute(this._app, routeSel, handler, false)
    return this
  }
}
