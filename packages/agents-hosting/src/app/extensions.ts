import { TurnContext } from '../turnContext'
import { AgentApplication } from './agentApplication'
import { RouteHandler } from './routeHandler'
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

  /**
   * Adds a route to the agent application that is only active for this extension's channel.
   * The route will only be triggered when the incoming activity's channel ID matches this extension's channel ID
   * and the route selector returns true.
   *
   * @param app - The agent application to add the route to
   * @param routeSelector - Function that determines if this route should handle the current context
   * @param routeHandler - Function that handles the route when it's selected
   * @param isInvokeRoute - Optional flag indicating if this is an invoke route (defaults to false)
   */
  addRoute (app: AgentApplication<TState>, routeSelector: RouteSelector, routeHandler: RouteHandler<TurnState>, isInvokeRoute: boolean = false) {
    const ensureChannelMatches = async (context: TurnContext) => {
      return context.activity.channelId === this.channelId && routeSelector(context)
    }
    app.addRoute(ensureChannelMatches, routeHandler)
  }
}
