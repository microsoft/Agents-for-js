import { Middleware, TurnContext } from '@microsoft/agents-hosting'
import { setTeamsApiClient } from '../teamsApiClient'

export class SetTeamsApiClientMiddleware implements Middleware {
  constructor (private readonly channelId: string = 'msteams') {}

  async onTurn (context: TurnContext, next: () => Promise<void>): Promise<void> {
    setTeamsApiClient(context, this.channelId)
    await next()
  }
}
