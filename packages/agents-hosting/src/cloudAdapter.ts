/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BotHandler, INVOKE_RESPONSE_KEY } from './activityHandler'
import { BaseAdapter } from './baseAdapter'
import { TurnContext } from './turnContext'
import { Response } from 'express'
import { Request } from './auth/request'
import { ConnectorClient } from './connector-client/connectorClient'
import { AuthConfiguration } from './auth/authConfiguration'
import { AuthProvider } from './auth/authProvider'
import { Activity, ActivityEventNames, ActivityTypes, Channels, ConversationReference, DeliveryModes } from '@microsoft/agents-activity'
import { ResourceResponse } from './connector-client/resourceResponse'
import { MsalTokenProvider } from './auth/msalTokenProvider'
import { ConversationParameters } from './connector-client/conversationParameters'
import * as uuid from 'uuid'
import { debug } from './logger'
import { StatusCodes } from './statusCodes'
import { InvokeResponse } from './invoke/invokeResponse'
import { AttachmentInfo } from './connector-client/attachmentInfo'
import { AttachmentData } from './connector-client/attachmentData'

const logger = debug('agents:cloud-adapter')

/**
 * Adapter for handling cloud-based bot interactions.
 */
export class CloudAdapter extends BaseAdapter {
  public connectorClient!: ConnectorClient

  /**
   * Creates an instance of CloudAdapter.
   * @param authConfig - The authentication configuration.
   * @param authProvider - The authentication provider.
   */
  constructor (authConfig: AuthConfiguration, authProvider?: AuthProvider) {
    super()

    this.authConfig = authConfig

    if (authProvider === undefined) {
      this.authProvider = new MsalTokenProvider()
    } else {
      this.authProvider = authProvider
    }
  }

  protected async createConnectorClient (
    serviceUrl: string,
    scope: string
  ): Promise<ConnectorClient> {
    return ConnectorClient.createClientWithAuthAsync(
      serviceUrl,
      this.authConfig,
      this.authProvider,
      scope
    )
  }

  protected setConnectorClient (
    context: TurnContext
  ) {
    context.turnState.set('connectorClient', this.connectorClient)
  }

  /**
   * Creates a TurnContext for the given activity and logic.
   * @param activity - The activity to process.
   * @param logic - The logic to execute.
   * @returns The created TurnContext.
   */
  createTurnContext (activity: Activity, logic: BotHandler): TurnContext {
    return new TurnContext(this, activity)
  }

  async createTurnContextWithScope (activity: Activity, logic: BotHandler, scope: string): Promise<TurnContext> {
    this.connectorClient = await ConnectorClient.createClientWithAuthAsync(activity.serviceUrl!, this.authConfig, this.authProvider, scope)
    return new TurnContext(this, activity)
  }

  /**
   * Sends multiple activities to the conversation.
   * @param context - The TurnContext for the current turn of the bot.
   * @param activities - The activities to send.
   * @returns A promise representing the array of ResourceResponses for the sent activities.
   */
  async sendActivities (context: TurnContext, activities: Activity[]): Promise<ResourceResponse[]> {
    if (!context) {
      throw new TypeError('`context` parameter required')
    }

    if (!activities) {
      throw new TypeError('`activities` parameter required')
    }

    if (activities.length === 0) {
      throw new Error('Expecting one or more activities, but the array was empty.')
    }

    const responses: ResourceResponse[] = []
    for (const activity of activities) {
      delete activity.id
      let response: ResourceResponse = { id: '' }

      if (activity.type === ActivityTypes.Delay) {
        await setTimeout(() => { }, typeof activity.value === 'number' ? activity.value : 1000)
      } else if (activity.type === ActivityTypes.InvokeResponse) {
        context.turnState.set(INVOKE_RESPONSE_KEY, activity)
      } else if (activity.type === ActivityTypes.Trace && activity.channelId !== Channels.Emulator) {
        // no-op
      } else {
        if (!activity.serviceUrl || (activity.conversation == null) || !activity.conversation.id) {
          throw new Error('Invalid activity object')
        }

        if (activity.replyToId) {
          response = await this.connectorClient.replyToActivityAsync(activity.conversation.id, activity.replyToId, activity)
        } else {
          response = await this.connectorClient.sendToConversationAsync(activity.conversation.id, activity)
        }
      }

      if (!response) {
        response = { id: activity.id ?? '' }
      }

      responses.push(response)
    }

    return responses
  }

  /**
   * Replies to an activity.
   * @param activity - The activity to reply to.
   * @returns A promise representing the ResourceResponse for the sent activity.
   */
  async replyToActivity (activity: Activity): Promise<ResourceResponse> {
    if (!activity.serviceUrl || (activity.conversation == null) || !activity.conversation.id || !activity.id) {
      throw new Error('Invalid activity object')
    }
    return await this.connectorClient.replyToActivityAsync(activity.conversation.id, activity.id, activity)
  }

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
    if (!this.isValidChannelActivity(activity)) {
      return end(StatusCodes.BAD_REQUEST)
    }

    logger.debug('Received activity: ', activity)

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
    logger.debug('Creating connector client with scope: ', scope)
    this.connectorClient = await this.createConnectorClient(activity.serviceUrl!, scope)

    const context = this.createTurnContext(activity, logic)
    this.setConnectorClient(context)
    await this.runMiddleware(context, logic)
    const invokeResponse = this.processTurnResults(context)

    return end(invokeResponse?.status ?? StatusCodes.OK, invokeResponse?.body)
  }

  private isValidChannelActivity (activity: Activity): Boolean {
    if (activity == null) {
      logger.warn('BadRequest: Missing activity')
      return false
    }

    if (activity.type == null || activity.type === '') {
      logger.warn('BadRequest: Missing activity type')
      return false
    }

    if (activity.conversation?.id == null || activity.conversation?.id === '') {
      logger.warn('BadRequest: Missing conversation.Id')
      return false
    }

    return true
  }

  /**
   * Updates an activity.
   * @param context - The TurnContext for the current turn of the bot.
   * @param activity - The activity to update.
   * @returns A promise representing the ResourceResponse for the updated activity.
   */
  async updateActivity (context: TurnContext, activity: Activity): Promise<ResourceResponse | void> {
    if (!context) {
      throw new TypeError('`context` parameter required')
    }

    if (!activity) {
      throw new TypeError('`activity` parameter required')
    }

    if (!activity.serviceUrl || (activity.conversation == null) || !activity.conversation.id || !activity.id) {
      throw new Error('Invalid activity object')
    }

    const response = await this.connectorClient.updateActivityAsync(
      activity.conversation.id,
      activity.id,
      activity
    )

    return response.id ? { id: response.id } : undefined
  }

  /**
   * Deletes an activity.
   * @param context - The TurnContext for the current turn of the bot.
   * @param reference - The conversation reference of the activity to delete.
   * @returns A promise representing the completion of the delete operation.
   */
  async deleteActivity (context: TurnContext, reference: Partial<ConversationReference>): Promise<void> {
    if (!context) {
      throw new TypeError('`context` parameter required')
    }

    if (!reference || !reference.serviceUrl || (reference.conversation == null) || !reference.conversation.id || !reference.activityId) {
      throw new Error('Invalid conversation reference object')
    }

    await this.connectorClient.deleteActivityAsync(reference.conversation.id, reference.activityId)
  }

  /**
   * Continues a conversation.
   * @param reference - The conversation reference to continue.
   * @param logic - The logic to execute.
   * @returns A promise representing the completion of the continue operation.
   */
  async continueConversation (reference: ConversationReference, logic: (revocableContext: TurnContext) => Promise<void>, isBotResponse: Boolean = false): Promise<void> {
    if (!reference || !reference.serviceUrl || (reference.conversation == null) || !reference.conversation.id) {
      throw new Error('Invalid conversation reference object')
    }

    let context
    if (isBotResponse) {
      context = await this.createTurnContextWithScope(Activity.getContinuationActivity(reference), logic, 'https://api.botframework.com')
    } else {
      context = this.createTurnContext(Activity.getContinuationActivity(reference), logic)
    }
    await this.runMiddleware(context, logic)
  }

  /**
 * Processes the turn results and returns an InvokeResponse if applicable.
 * @param context - The TurnContext for the current turn of the bot.
 * @returns The InvokeResponse if applicable, otherwise undefined.
 */
  protected processTurnResults (context: TurnContext): InvokeResponse | undefined {
    // Handle ExpectedReplies scenarios where all activities have been buffered and sent back at once in an invoke response.
    if (context.activity.deliveryMode === DeliveryModes.ExpectReplies) {
      return {
        status: StatusCodes.OK,
        body: {
          activities: context.bufferedReplyActivities
        }
      }
    }

    // Handle Invoke scenarios where the bot will return a specific body and return code.
    if (context.activity.type === ActivityTypes.Invoke) {
      const activityInvokeResponse = context.turnState.get<Activity>(INVOKE_RESPONSE_KEY)
      if (!activityInvokeResponse) {
        return { status: StatusCodes.NOT_IMPLEMENTED }
      }

      return activityInvokeResponse.value as InvokeResponse
    }

    // No body to return.
    return undefined
  }

  /**
   * Creates an activity to represent the result of creating a conversation.
   * @param createdConversationId - The ID of the created conversation.
   * @param channelId - The channel ID.
   * @param serviceUrl - The service URL.
   * @param conversationParameters - The conversation parameters.
   * @returns The created activity.
   */
  protected createCreateActivity (
    createdConversationId: string | undefined,
    channelId: string,
    serviceUrl: string,
    conversationParameters: ConversationParameters
  ): Activity {
    // Create a conversation update activity to represent the result.
    const activity = new Activity(ActivityTypes.Event)

    activity.name = ActivityEventNames.CreateConversation
    activity.channelId = channelId
    activity.serviceUrl = serviceUrl
    activity.id = createdConversationId ?? uuid.v4()
    activity.conversation = {
      conversationType: undefined,
      id: createdConversationId!,
      isGroup: conversationParameters.isGroup,
      name: undefined,
      tenantId: conversationParameters.tenantId,
    }
    activity.channelData = conversationParameters.channelData
    activity.recipient = conversationParameters.bot

    return activity
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

    const restClient = await this.createConnectorClient(serviceUrl, audience)
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

  /**
   * Uploads an attachment.
   * @param conversationId - The conversation ID.
   * @param attachmentData - The attachment data.
   * @returns A promise representing the ResourceResponse for the uploaded attachment.
   */
  async uploadAttachment (conversationId: string, attachmentData: AttachmentData): Promise<ResourceResponse> {
    if (conversationId === undefined) {
      throw new Error('conversationId is required')
    }

    if (attachmentData === undefined) {
      throw new Error('attachmentData is required')
    }

    return await this.connectorClient.uploadAttachment(conversationId, attachmentData)
  }

  /**
   * Gets attachment information.
   * @param attachmentId - The attachment ID.
   * @returns A promise representing the AttachmentInfo for the requested attachment.
   */
  async getAttachmentInfo (attachmentId: string): Promise<AttachmentInfo> {
    if (attachmentId === undefined) {
      throw new Error('attachmentId is required')
    }

    return await this.connectorClient.getAttachmentInfo(attachmentId)
  }

  /**
   * Gets an attachment.
   * @param attachmentId - The attachment ID.
   * @param viewId - The view ID.
   * @returns A promise representing the NodeJS.ReadableStream for the requested attachment.
   */
  async getAttachment (attachmentId: string, viewId: string): Promise<NodeJS.ReadableStream> {
    if (attachmentId === undefined) {
      throw new Error('attachmentId is required')
    }

    if (viewId === undefined) {
      throw new Error('viewId is required')
    }

    return await this.connectorClient.getAttachment(attachmentId, viewId)
  }
}
