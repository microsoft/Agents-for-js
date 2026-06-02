import { ExceptionHelper } from '@microsoft/agents-activity'
import { ConnectorClient, TurnContext } from '@microsoft/agents-hosting'
import { Client as TeamsClient } from '@microsoft/teams.api'
import { Errors } from './errorHelper'

export const TeamsApiClientKey = Symbol('TeamsApiClient')

export function setTeamsApiClient (context: TurnContext, channelId: string = 'msteams'): void {
  if (context.activity.channelId !== channelId || context.turnState.has(TeamsApiClientKey)) {
    return
  }

  const connectorClient = context.turnState.get<ConnectorClient>(context.adapter.ConnectorClientKey)
  const serviceUrl = context.activity.serviceUrl ?? connectorClient?.axiosInstance.defaults.baseURL

  if (!connectorClient) {
    throw ExceptionHelper.generateException(Error, Errors.TeamsApiClientSetupFailed, undefined, { missing: 'ConnectorClient in turnState' })
  }

  if (!serviceUrl) {
    throw ExceptionHelper.generateException(Error, Errors.TeamsApiClientSetupFailed, undefined, { missing: 'activity.serviceUrl and ConnectorClient baseURL' })
  }

  context.turnState.set(
    TeamsApiClientKey,
    new TeamsClient(serviceUrl, {
      headers: getClientHeaders(connectorClient)
    })
  )
}

export function getTeamsClient (context: TurnContext): TeamsClient {
  const teamsClient = context.turnState.get<TeamsClient>(TeamsApiClientKey)

  if (!teamsClient) {
    throw ExceptionHelper.generateException(Error, Errors.TeamsApiClientNotAvailable)
  }

  return teamsClient
}

function getClientHeaders (connectorClient: ConnectorClient): Record<string, string> {
  const commonHeaders = connectorClient.axiosInstance.defaults.headers.common
  const headers = Object.entries(commonHeaders ?? {}).filter(([, value]) => typeof value === 'string')

  return Object.fromEntries(headers) as Record<string, string>
}
