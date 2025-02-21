/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Response } from 'express'
import { Activity, ActivityTypes, DeliveryModes, CloudAdapter, ConversationParameters, debug, StatusCodes, TurnContext, Request } from '@microsoft/agents-bot-hosting'
import { TeamsConnectorClient } from './connector-client/teamsConnectorClient'

const logger = debug('agents:teams-cloud-adapter')

/**
 * Adapter for handling cloud-based bot interactions.
 */
export class TeamsCloudAdapter extends CloudAdapter {
  public teamsConnectorClient!: TeamsConnectorClient

  /**
   * Processes an incoming request and sends the response.
   * @param request - The incoming request.
   * @param res - The response to send.
   * @param logic - The logic to execute.
   */
  public async process (
    request: Request,
    res: Response,
    logic: (context: TurnContext) => Promise<void>): Promise<void> {
    const end = (status: StatusCodes, body?: unknown, isInvokeResponseOrExpectReplies: boolean = false) => {
      res.status(status)
      if (isInvokeResponseOrExpectReplies) {
        res.setHeader('content-type', 'application/json')
      }
      if (body) {
        res.send(body)
      }
      res.end()
    }

    const activity = Activity.fromObject(request.body!)

    logger.info('Received activity: ', activity)

    if (
      activity?.type === ActivityTypes.InvokeResponse ||
      activity?.type === ActivityTypes.Invoke ||
      activity?.deliveryMode === DeliveryModes.ExpectReplies
    ) {
      const context = this.createTurnContext(activity, logic)
      await this.runMiddleware(context, logic)
      const invokeResponse = this.processTurnResults(context)
      return end(invokeResponse?.status ?? StatusCodes.OK, JSON.stringify(invokeResponse?.body), true)
    }

    const scope = request.user?.azp ?? request.user?.appid ?? 'https://api.botframework.com'
    logger.info('Creating connector client with scope: ', scope)
    this.connectorClient = await TeamsConnectorClient.createClientWithAuthAsync(activity.serviceUrl!, this.authConfig, this.authProvider, scope)

    const context = this.createTurnContext(activity, logic)
    context.turnState.set('connectorClient', this.connectorClient)
    await this.runMiddleware(context, logic)
    const invokeResponse = this.processTurnResults(context)

    return end(invokeResponse?.status ?? StatusCodes.OK, invokeResponse?.body)
  }

  /**
   * Creates a conversation.
   * @param botAppId - The bot application ID.
   * @param channelId - The channel ID.
   * @param serviceUrl - The service URL.
   * @param audience - The audience.
   * @param conversationParameters - The conversation parameters.
   * @param logic - The logic to execute.
   * @returns A promise representing the completion of the create operation.
   */
  async createConversationAsync (
    botAppId: string,
    channelId: string,
    serviceUrl: string,
    audience: string,
    conversationParameters: ConversationParameters,
    logic: (context: TurnContext) => Promise<void>
  ): Promise<void> {
    if (typeof serviceUrl !== 'string' || !serviceUrl) {
      throw new TypeError('`serviceUrl` must be a non-empty string')
    }
    if (!conversationParameters) throw new TypeError('`conversationParameters` must be defined')
    if (!logic) throw new TypeError('`logic` must be defined')

    const restClient = await TeamsConnectorClient.createClientWithAuthAsync(serviceUrl, this.authConfig, this.authProvider, audience)
    const createConversationResult = await restClient.createConversationAsync(conversationParameters)
    const createActivity = this.createCreateActivity(
      createConversationResult.id,
      channelId,
      serviceUrl,
      conversationParameters
    )
    const context = new TurnContext(this, createActivity)
    await this.runMiddleware(context, logic)
  }
}
