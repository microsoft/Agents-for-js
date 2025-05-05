import { AgentApplication, AgentExtension, RouteHandler, RouteSelector, TurnState } from '@microsoft/agents-hosting'
export class MyTeamsExt implements AgentExtension {
  channelId = 'myTeamsExt'
  _app: AgentApplication<TurnState>
  constructor (private app: AgentApplication<TurnState>) {
    this._app = app
  }

  addRoute (app: AgentApplication<TurnState>, routeSelector: RouteSelector, routeHandler: RouteHandler<TurnState>, isInvokeRoute: boolean): void {
    // Add your custom route logic here
    console.log('Adding route for MyTeamsExt')
    // app.addRoute(routeSelector, routeHandler)
  }
}
