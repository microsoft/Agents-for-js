/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CloudAdapter, TurnContext } from '@microsoft/agents-hosting'
import { TeamsConnectorClient } from './connector-client/teamsConnectorClient'

/**
 * Adapter for handling cloud-based bot interactions.
 */
export class TeamsCloudAdapter extends CloudAdapter {
  public connectorClient!: TeamsConnectorClient

  protected async createConnectorClient (
    serviceUrl: string,
    scope: string
  ): Promise<TeamsConnectorClient> {
    return TeamsConnectorClient.createClientWithAuthAsync(
      serviceUrl,
      this.authConfig,
      this.authProvider,
      scope
    )
  }

  protected setConnectorClient (
    context: TurnContext
  ) {
    context.turnState.set('teamsConnectorClient', this.connectorClient)
  }
}
