import { AgentApplication } from './agentApplication'
import { RouteHandler } from './routeHandler'
import { RouteSelector } from './routeSelector'
import { TurnState } from './turnState'

export interface AgentExtension {
  channelId: string;
  addRoute: (app: AgentApplication<TurnState>, routeSelector: RouteSelector, routeHandler: RouteHandler<TurnState>, isInvokeRoute: boolean) => void;
}
