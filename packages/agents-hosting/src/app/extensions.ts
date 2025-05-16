import { TurnContext } from '../turnContext'
import { AgentApplication } from './agentApplication'
import { RouteHandler } from './routeHandler'
import { RouteSelector } from './routeSelector'
import { TurnState } from './turnState'

export class AgentExtension<TState extends TurnState> {
  channelId: string
  constructor (channelId: string) {
    this.channelId = channelId
  }

  addRoute (app: AgentApplication<TState>, routeSelector: RouteSelector, routeHandler: RouteHandler<TurnState>, isInvokeRoute: boolean = false) {
    const ensureChannelMatches = async (context: TurnContext) => {
      return context.activity.channelId === this.channelId && routeSelector(context)
    }
    app.addRoute(ensureChannelMatches, routeHandler)
  }
}
