import { TurnContext } from '../turnContext'
import { AgentApplication } from './agentApplication'
import { RouteHandler } from './routeHandler'
import { RouteRank } from './routeRank'
import { RouteSelector } from './routeSelector'
import { TurnState } from './turnState'

/**
 * Represents an extension that adds channel-specific routing functionality to an agent application.
 * This class allows you to register routes that are only active for a specific channel.
 *
 * @template TState - The type of turn state that extends TurnState
 */
export class AgentExtension<TState extends TurnState> {
  /** The channel ID that this extension is associated with */
  channelId: string

  /**
   * Creates a new AgentExtension instance for the specified channel.
   *
   * @param channelId - The channel ID that this extension will be associated with
   */
  constructor (channelId: string) {
    this.channelId = channelId
  }

  addRoute (
    app: AgentApplication<TState>,
    routeSelector: RouteSelector,
    routeHandler: RouteHandler<TurnState>,
    isInvokeRoute: boolean = false,
    rank: number = RouteRank.Unspecified) {
    const ensureChannelMatches = async (context: TurnContext) => {
      return context.activity.channelId === this.channelId && routeSelector(context)
    }
    app.addRoute(ensureChannelMatches, routeHandler, isInvokeRoute, rank)
  }
}
